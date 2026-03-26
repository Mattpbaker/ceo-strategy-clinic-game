import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.PLAYTEST_URL || "https://ceo-strategy-clinic-game.vercel.app/";
const HEADLESS = process.env.HEADLESS !== "0";
const STOP_AFTER = process.env.PLAYTEST_STOP_AFTER || "";

const roleDirs = new Map();
const roleLogs = new Map();
const roleShots = new Map();

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function stampForPath(date = new Date()) {
  return date.toISOString().replace(/[:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function appendSummary(runSummary, type, detail) {
  runSummary.steps.push({
    type,
    detail,
    at: nowIso()
  });
}

function nextShotPath(role, label) {
  const next = (roleShots.get(role) || 0) + 1;
  roleShots.set(role, next);
  return path.join(roleDirs.get(role), `${String(next).padStart(2, "0")}-${slugify(label)}.png`);
}

async function captureState(page) {
  let renderState = null;
  try {
    renderState = await page.evaluate(() => {
      if (typeof window.render_game_to_text !== "function") {
        return null;
      }

      const raw = window.render_game_to_text();
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    });
  } catch {
    renderState = null;
  }

  const domSummary = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      headings: Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean),
      badges: Array.from(document.querySelectorAll(".badge"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean),
      notices: Array.from(document.querySelectorAll(".notice, .error"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
    };
  });

  return {
    captured_at: nowIso(),
    render_state: renderState,
    dom_summary: domSummary
  };
}

async function snapshot(page, role, label, extra = {}) {
  const shotPath = nextShotPath(role, label);
  const jsonPath = shotPath.replace(/\.png$/, ".json");
  await page.screenshot({ path: shotPath, fullPage: true });
  const state = await captureState(page);
  writeJson(jsonPath, { label, ...state, ...extra });
  return {
    screenshot: shotPath,
    state: jsonPath
  };
}

function attachObservers(role, page) {
  const log = {
    console_errors: [],
    page_errors: [],
    failed_requests: []
  };

  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }

    log.console_errors.push({
      at: nowIso(),
      url: page.url(),
      text: msg.text()
    });
  });

  page.on("pageerror", (err) => {
    log.page_errors.push({
      at: nowIso(),
      url: page.url(),
      text: String(err)
    });
  });

  page.on("requestfailed", (request) => {
    log.failed_requests.push({
      at: nowIso(),
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "unknown"
    });
  });

  roleLogs.set(role, log);
}

function flushLogs() {
  for (const [role, log] of roleLogs.entries()) {
    const dir = roleDirs.get(role);
    writeJson(path.join(dir, "console-errors.json"), log.console_errors);
    writeJson(path.join(dir, "page-errors.json"), log.page_errors);
    writeJson(path.join(dir, "failed-requests.json"), log.failed_requests);
  }
}

async function gotoHome(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

async function waitForPlayerPhase(page, roundNumber, roundPhase, timeout = 30000) {
  await page.waitForFunction(
    ({ innerRoundNumber, innerRoundPhase }) => {
      if (typeof window.render_game_to_text !== "function") {
        return false;
      }
      try {
        const payload = JSON.parse(window.render_game_to_text());
        return (
          payload.round_number === innerRoundNumber &&
          payload.round_phase === innerRoundPhase &&
          payload.session_status !== "waiting"
        );
      } catch {
        return false;
      }
    },
    { innerRoundNumber: roundNumber, innerRoundPhase: roundPhase },
    { timeout }
  );
}

async function waitForDecisionSubmitted(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      if (typeof window.render_game_to_text !== "function") {
        return false;
      }
      try {
        const payload = JSON.parse(window.render_game_to_text());
        return payload.decision_submitted_this_round === true;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout }
  );
}

async function waitForPlayerStatus(page, status, timeout = 30000) {
  await page.waitForFunction(
    (innerStatus) => {
      if (typeof window.render_game_to_text !== "function") {
        return false;
      }
      try {
        const payload = JSON.parse(window.render_game_to_text());
        return payload.session_status === innerStatus;
      } catch {
        return false;
      }
    },
    status,
    { timeout }
  );
}

async function getPlayerRenderState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function getSessionState(page) {
  return page.evaluate(async () => {
    const sessionRef = window.location.pathname.split("/").filter(Boolean).at(-1);
    const response = await fetch(`/api/sessions/${sessionRef}/state`);
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error || "Unable to load session state");
    }
    return payload.data;
  });
}

async function createSession(page, facilitatorName) {
  await gotoHome(page);
  await page.getByLabel("Facilitator name").fill(facilitatorName);
  await page.getByRole("button", { name: "Create Session" }).click();
  await page.waitForURL(/\/facilitator\//, { timeout: 30000 });
  await page.waitForSelector("h1:has-text('Facilitator Console')", { timeout: 30000 });
  await page.waitForTimeout(1500);

  const url = new URL(page.url());
  const sessionCode = url.pathname.split("/").filter(Boolean).at(-1);
  const facilitatorToken = url.searchParams.get("token") || "";
  if (!sessionCode || !facilitatorToken) {
    throw new Error("Unable to extract facilitator session code or token");
  }

  return { sessionCode, facilitatorToken };
}

async function joinSession(page, sessionCode, nickname) {
  await gotoHome(page);
  await page.getByLabel("Session code").fill(sessionCode);
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Join Session" }).click();
  await page.waitForURL(/\/session\//, { timeout: 30000 });
  await page.waitForSelector("h1:has-text('Player Dashboard')", { timeout: 30000 });
  await page.waitForTimeout(1500);
  return new URL(page.url()).searchParams.get("playerId");
}

async function waitForFacilitatorPlayers(page, count) {
  await page.getByText(new RegExp(`Players:\\s*${count}`, "i")).waitFor({ timeout: 30000 });
}

async function clickButton(page, name) {
  await page.getByRole("button", { name }).click();
  await page.waitForTimeout(1200);
}

async function submitDecision(page, strategy) {
  const strategyCard = page.locator("article.card").filter({
    has: page.getByRole("heading", { name: "Strategy Decision" })
  }).first();

  const budgetMap = {
    Growth: strategy.budget.growth,
    People: strategy.budget.people,
    Resilience: strategy.budget.resilience,
    Brand: strategy.budget.brand,
    Compliance: strategy.budget.compliance
  };

  for (const [label, value] of Object.entries(budgetMap)) {
    await strategyCard.getByRole("spinbutton", { name: label }).fill(String(value));
  }

  await strategyCard.getByLabel("Focus action").selectOption({ label: strategy.focusLabel });
  await strategyCard.getByLabel("Risk posture").selectOption({ label: strategy.riskLabel });
  await strategyCard.getByRole("button", { name: /Submit decision|Update decision/ }).click();
  await waitForDecisionSubmitted(page);
  await page.waitForTimeout(1200);
}

async function openDrawer(page) {
  const buttons = page.getByRole("button", { name: /Message Center/ });
  await buttons.first().click();
  await page.waitForSelector("aside.drawer-panel", { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function closeDrawer(page) {
  const closeButton = page.getByRole("button", { name: "Close" });
  if (await closeButton.count()) {
    await closeButton.last().click();
    await page.waitForTimeout(300);
  }
}

async function selectDrawerTab(page, label) {
  await page.locator(".drawer-tabs button", { hasText: label }).click();
  await page.waitForTimeout(400);
}

async function sendProposalUi(page, { targetCompanyName, interactionLabel, intensity, message, expiresInMinutes }) {
  await openDrawer(page);
  await selectDrawerTab(page, "Compose");
  await page.getByLabel("Target company").selectOption({ label: targetCompanyName });
  await page.getByLabel("Interaction type").selectOption({ label: interactionLabel });
  await page.getByLabel("Intensity (10-100)").fill(String(intensity));
  if (expiresInMinutes) {
    const expiryLabel = expiresInMinutes === 1 ? "1 minute" : `${expiresInMinutes} minutes`;
    await page.getByLabel("Expires in").selectOption({ label: expiryLabel });
  }
  await page.getByLabel("Message (optional)").fill(message);
  await page.getByRole("button", { name: "Send proposal" }).click();
  await page.waitForTimeout(1500);
  await closeDrawer(page);
}

async function respondProposalUi(page, { companyName, interactionLabel, actionLabel }) {
  await openDrawer(page);
  await selectDrawerTab(page, "Inbox");
  const item = page.locator(".message-item", {
    hasText: companyName
  }).filter({ hasText: interactionLabel }).first();
  await item.waitFor({ timeout: 15000 });
  await item.getByRole("button", { name: actionLabel }).click();
  await page.waitForTimeout(1500);
  await closeDrawer(page);
}

async function respondCounterUi(page, { companyName, interactionLabel, intensity, message }) {
  await openDrawer(page);
  await selectDrawerTab(page, "Inbox");
  const item = page.locator(".message-item", {
    hasText: companyName
  }).filter({ hasText: interactionLabel }).first();
  await item.waitFor({ timeout: 15000 });
  await item.getByRole("button", { name: "Counter" }).click();
  await item.getByLabel("Counter intensity (10-100)").fill(String(intensity));
  await item.getByLabel("Counter message").fill(message);
  await item.getByRole("button", { name: "Send counter" }).click();
  await page.waitForTimeout(1500);
  await closeDrawer(page);
}

async function injectFacilitatorEvent(page) {
  await page.getByLabel("Category").selectOption({ label: "Economic" });
  await page.getByLabel("Severity").selectOption({ label: "High" });
  await page.getByLabel("Title").fill("Investor Liquidity Shock");
  await page
    .getByLabel("Narrative")
    .fill("Capital markets seize up, forcing teams to balance resilience, compliance, and growth.");
  await page.getByLabel(/cash \(-60 to 60\)/i).fill("-18");
  await page.getByLabel(/operational_resilience \(-30 to 30\)/i).fill("-8");
  await page.getByLabel(/regulatory_risk \(-30 to 30\)/i).fill("12");
  await page.getByRole("button", { name: "Inject Event" }).click();
  await page.waitForTimeout(1500);
}

async function waitForCompleted(page, timeout = 30000) {
  await waitForPlayerStatus(page, "completed", timeout);
}

async function main() {
  const timestamp = stampForPath();
  const runRoot = path.resolve("output/web-game", `vercel-playtest-${timestamp}`);
  const facilitatorDir = path.join(runRoot, "facilitator");
  const coopDir = path.join(runRoot, "student-coop");
  const aggressiveDir = path.join(runRoot, "student-aggressive");
  const conservativeDir = path.join(runRoot, "student-conservative");
  const sharedDir = path.join(runRoot, "shared");

  for (const dir of [facilitatorDir, coopDir, aggressiveDir, conservativeDir, sharedDir]) {
    ensureDir(dir);
  }

  roleDirs.set("facilitator", facilitatorDir);
  roleDirs.set("student-coop", coopDir);
  roleDirs.set("student-aggressive", aggressiveDir);
  roleDirs.set("student-conservative", conservativeDir);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--use-gl=angle", "--use-angle=swiftshader"]
  });

  const runSummary = {
    started_at: nowIso(),
    base_url: BASE_URL,
    run_root: runRoot,
    used_counter_api_workaround: false,
    used_expiry_api_workaround: false,
    findings_seed: [],
    steps: [],
    session: null,
    roles: {},
    blocker: null
  };

  const roles = {
    facilitator: {
      context: await browser.newContext({ viewport: { width: 1440, height: 1400 } }),
      nickname: `Facilitator-${timestamp.slice(11, 15)}`
    },
    "student-coop": {
      context: await browser.newContext({ viewport: { width: 1440, height: 1400 } }),
      nickname: `Coop-${timestamp.slice(11, 15)}`,
      companyName: null,
      focusLabel: "Invest in people",
      riskLabel: "Balanced",
      budget: { growth: 20, people: 25, resilience: 25, brand: 20, compliance: 10 }
    },
    "student-aggressive": {
      context: await browser.newContext({ viewport: { width: 1440, height: 1400 } }),
      nickname: `Aggro-${timestamp.slice(11, 15)}`,
      companyName: null,
      focusLabel: "Expand market",
      riskLabel: "Aggressive",
      budget: { growth: 35, people: 10, resilience: 10, brand: 25, compliance: 20 }
    },
    "student-conservative": {
      context: await browser.newContext({ viewport: { width: 1440, height: 1400 } }),
      nickname: `Cautious-${timestamp.slice(11, 15)}`,
      companyName: null,
      focusLabel: "Risk mitigation",
      riskLabel: "Conservative",
      budget: { growth: 10, people: 20, resilience: 35, brand: 10, compliance: 25 }
    }
  };

  const facilitatorPage = await roles.facilitator.context.newPage();
  const coopPage = await roles["student-coop"].context.newPage();
  const aggressivePage = await roles["student-aggressive"].context.newPage();
  const conservativePage = await roles["student-conservative"].context.newPage();

  attachObservers("facilitator", facilitatorPage);
  attachObservers("student-coop", coopPage);
  attachObservers("student-aggressive", aggressivePage);
  attachObservers("student-conservative", conservativePage);

  const allPages = [
    { role: "facilitator", page: facilitatorPage },
    { role: "student-coop", page: coopPage },
    { role: "student-aggressive", page: aggressivePage },
    { role: "student-conservative", page: conservativePage }
  ];

  async function snapshotAll(label) {
    for (const entry of allPages) {
      await snapshot(entry.page, entry.role, label);
    }
  }

  try {
    appendSummary(runSummary, "setup", "Opening facilitator landing page");
    await gotoHome(facilitatorPage);
    await snapshot(facilitatorPage, "facilitator", "landing-page");

    const created = await createSession(facilitatorPage, roles.facilitator.nickname);
    runSummary.session = created;
    appendSummary(runSummary, "session_created", created);
    await snapshot(facilitatorPage, "facilitator", "session-created-waiting-room", created);

    if (STOP_AFTER === "create") {
      flushLogs();
      writeJson(path.join(sharedDir, "run-summary.json"), runSummary);
      await browser.close();
      return;
    }

    appendSummary(runSummary, "join", "Joining session from three player contexts");
    const joinResults = await Promise.all([
      joinSession(coopPage, created.sessionCode, roles["student-coop"].nickname),
      joinSession(aggressivePage, created.sessionCode, roles["student-aggressive"].nickname),
      joinSession(conservativePage, created.sessionCode, roles["student-conservative"].nickname)
    ]);

    runSummary.roles = {
      "student-coop": { player_id: joinResults[0], nickname: roles["student-coop"].nickname },
      "student-aggressive": { player_id: joinResults[1], nickname: roles["student-aggressive"].nickname },
      "student-conservative": { player_id: joinResults[2], nickname: roles["student-conservative"].nickname }
    };

    roles["student-coop"].companyName = `${roles["student-coop"].nickname} Ventures`;
    roles["student-aggressive"].companyName = `${roles["student-aggressive"].nickname} Ventures`;
    roles["student-conservative"].companyName = `${roles["student-conservative"].nickname} Ventures`;

    await Promise.all([
      snapshot(coopPage, "student-coop", "joined-player-dashboard"),
      snapshot(aggressivePage, "student-aggressive", "joined-player-dashboard"),
      snapshot(conservativePage, "student-conservative", "joined-player-dashboard")
    ]);

    await waitForFacilitatorPlayers(facilitatorPage, 3);
    await snapshot(facilitatorPage, "facilitator", "all-three-players-joined");

    appendSummary(runSummary, "round_1", "Starting session and running round 1");
    await clickButton(facilitatorPage, "Start");
    await Promise.all([
      waitForPlayerPhase(coopPage, 1, "decision"),
      waitForPlayerPhase(aggressivePage, 1, "decision"),
      waitForPlayerPhase(conservativePage, 1, "decision")
    ]);
    await snapshotAll("round-1-decision-open");

    await submitDecision(coopPage, roles["student-coop"]);
    await submitDecision(aggressivePage, roles["student-aggressive"]);
    await submitDecision(conservativePage, roles["student-conservative"]);
    await snapshotAll("round-1-decisions-submitted");

    await clickButton(facilitatorPage, "Open Interaction");
    await Promise.all([
      waitForPlayerPhase(coopPage, 1, "interaction"),
      waitForPlayerPhase(aggressivePage, 1, "interaction"),
      waitForPlayerPhase(conservativePage, 1, "interaction")
    ]);
    await snapshotAll("round-1-interaction-open");

    await sendProposalUi(coopPage, {
      targetCompanyName: roles["student-conservative"].companyName,
      interactionLabel: "Trade contract",
      intensity: 55,
      message: "Shared supplier contract with stable pricing."
    });
    await snapshot(coopPage, "student-coop", "round-1-trade-contract-sent");

    await respondProposalUi(conservativePage, {
      companyName: roles["student-coop"].companyName,
      interactionLabel: "Trade contract",
      actionLabel: "Accept"
    });
    await snapshot(conservativePage, "student-conservative", "round-1-trade-contract-accepted");

    await sendProposalUi(aggressivePage, {
      targetCompanyName: roles["student-coop"].companyName,
      interactionLabel: "Price war",
      intensity: 70,
      message: "We are forcing price compression in your strongest segment."
    });
    await snapshot(aggressivePage, "student-aggressive", "round-1-price-war-sent");

    await respondProposalUi(coopPage, {
      companyName: roles["student-aggressive"].companyName,
      interactionLabel: "Price war",
      actionLabel: "Reject"
    });
    await snapshot(coopPage, "student-coop", "round-1-price-war-rejected");

    await clickButton(facilitatorPage, "Resolve Round");
    await Promise.all([
      waitForPlayerPhase(coopPage, 2, "decision"),
      waitForPlayerPhase(aggressivePage, 2, "decision"),
      waitForPlayerPhase(conservativePage, 2, "decision")
    ]);
    await snapshotAll("round-1-resolved-round-2-open");

    appendSummary(runSummary, "round_2", "Submitting two decisions, pausing, resuming, then testing counter flow");
    await submitDecision(coopPage, roles["student-coop"]);
    await submitDecision(aggressivePage, roles["student-aggressive"]);
    await snapshotAll("round-2-two-decisions-before-pause");

    await clickButton(facilitatorPage, "Pause");
    await Promise.all([
      waitForPlayerStatus(coopPage, "paused"),
      waitForPlayerStatus(aggressivePage, "paused"),
      waitForPlayerStatus(conservativePage, "paused")
    ]);
    await snapshotAll("round-2-paused");

    await clickButton(facilitatorPage, "Resume");
    await Promise.all([
      waitForPlayerStatus(coopPage, "running"),
      waitForPlayerStatus(aggressivePage, "running"),
      waitForPlayerStatus(conservativePage, "running")
    ]);
    await submitDecision(conservativePage, roles["student-conservative"]);
    await snapshotAll("round-2-resumed-all-decisions-submitted");

    await clickButton(facilitatorPage, "Open Interaction");
    await Promise.all([
      waitForPlayerPhase(coopPage, 2, "interaction"),
      waitForPlayerPhase(aggressivePage, 2, "interaction"),
      waitForPlayerPhase(conservativePage, 2, "interaction")
    ]);

    await sendProposalUi(aggressivePage, {
      targetCompanyName: roles["student-conservative"].companyName,
      interactionLabel: "Talent poach",
      intensity: 65,
      message: "Senior team lift with aggressive retention offers."
    });
    await snapshot(aggressivePage, "student-aggressive", "round-2-talent-poach-sent");
    await respondCounterUi(conservativePage, {
      companyName: roles["student-aggressive"].companyName,
      interactionLabel: "Talent poach",
      intensity: 30,
      message: "Counter-offer: shared training exchange instead of direct poach."
    });
    await snapshot(conservativePage, "student-conservative", "round-2-countered");

    await respondProposalUi(aggressivePage, {
      companyName: roles["student-conservative"].companyName,
      interactionLabel: "Talent poach",
      actionLabel: "Accept"
    });
    await snapshot(aggressivePage, "student-aggressive", "round-2-counter-accepted");

    await clickButton(facilitatorPage, "Resolve Round");
    await Promise.all([
      waitForPlayerPhase(coopPage, 3, "decision"),
      waitForPlayerPhase(aggressivePage, 3, "decision"),
      waitForPlayerPhase(conservativePage, 3, "decision")
    ]);
    await snapshotAll("round-2-resolved-round-3-open");

    appendSummary(runSummary, "round_3", "Injecting one ad-hoc event and resolving an accepted joint venture");
    await injectFacilitatorEvent(facilitatorPage);
    await snapshot(facilitatorPage, "facilitator", "round-3-event-injected");

    await submitDecision(coopPage, roles["student-coop"]);
    await submitDecision(aggressivePage, roles["student-aggressive"]);
    await submitDecision(conservativePage, roles["student-conservative"]);
    await clickButton(facilitatorPage, "Open Interaction");
    await Promise.all([
      waitForPlayerPhase(coopPage, 3, "interaction"),
      waitForPlayerPhase(aggressivePage, 3, "interaction"),
      waitForPlayerPhase(conservativePage, 3, "interaction")
    ]);

    await sendProposalUi(coopPage, {
      targetCompanyName: roles["student-conservative"].companyName,
      interactionLabel: "Joint venture",
      intensity: 60,
      message: "Shared market-entry venture to offset the shock."
    });
    await respondProposalUi(conservativePage, {
      companyName: roles["student-coop"].companyName,
      interactionLabel: "Joint venture",
      actionLabel: "Accept"
    });
    await snapshotAll("round-3-joint-venture-accepted");

    await clickButton(facilitatorPage, "Resolve Round");
    await Promise.all([
      waitForPlayerPhase(coopPage, 4, "decision"),
      waitForPlayerPhase(aggressivePage, 4, "decision"),
      waitForPlayerPhase(conservativePage, 4, "decision")
    ]);
    await snapshotAll("round-3-resolved-round-4-open");

    appendSummary(runSummary, "round_4", "Exercising message center and analytics with another accepted trade contract");
    await submitDecision(coopPage, roles["student-coop"]);
    await submitDecision(aggressivePage, roles["student-aggressive"]);
    await submitDecision(conservativePage, roles["student-conservative"]);
    await openDrawer(facilitatorPage);
    await snapshot(facilitatorPage, "facilitator", "round-4-message-center-open");
    await closeDrawer(facilitatorPage);
    await openDrawer(coopPage);
    await selectDrawerTab(coopPage, "Outbox");
    await snapshot(coopPage, "student-coop", "round-4-player-message-center-open");
    await closeDrawer(coopPage);

    await clickButton(facilitatorPage, "Open Interaction");
    await Promise.all([
      waitForPlayerPhase(coopPage, 4, "interaction"),
      waitForPlayerPhase(aggressivePage, 4, "interaction"),
      waitForPlayerPhase(conservativePage, 4, "interaction")
    ]);

    await sendProposalUi(conservativePage, {
      targetCompanyName: roles["student-coop"].companyName,
      interactionLabel: "Trade contract",
      intensity: 50,
      message: "Stability pact to absorb event-driven volatility."
    });
    await respondProposalUi(coopPage, {
      companyName: roles["student-conservative"].companyName,
      interactionLabel: "Trade contract",
      actionLabel: "Accept"
    });
    await snapshotAll("round-4-trade-contract-accepted");

    await clickButton(facilitatorPage, "Resolve Round");
    await Promise.all([
      waitForPlayerPhase(coopPage, 5, "decision"),
      waitForPlayerPhase(aggressivePage, 5, "decision"),
      waitForPlayerPhase(conservativePage, 5, "decision")
    ]);
    await snapshotAll("round-4-resolved-round-5-open");

    appendSummary(runSummary, "round_5", "Creating a short-expiry proposal and resolving after expiry");
    await submitDecision(coopPage, roles["student-coop"]);
    await submitDecision(aggressivePage, roles["student-aggressive"]);
    await submitDecision(conservativePage, roles["student-conservative"]);
    await clickButton(facilitatorPage, "Open Interaction");
    await Promise.all([
      waitForPlayerPhase(coopPage, 5, "interaction"),
      waitForPlayerPhase(aggressivePage, 5, "interaction"),
      waitForPlayerPhase(conservativePage, 5, "interaction")
    ]);

    await sendProposalUi(aggressivePage, {
      targetCompanyName: roles["student-conservative"].companyName,
      interactionLabel: "Reputation challenge",
      intensity: 80,
      message: "Public challenge campaign to pressure your brand positioning.",
      expiresInMinutes: 1
    });
    await snapshot(aggressivePage, "student-aggressive", "round-5-expiring-proposal-sent");
    await snapshot(conservativePage, "student-conservative", "round-5-proposal-left-pending");
    await sleep(65000);
    await clickButton(facilitatorPage, "Resolve Round");
    await Promise.all([
      waitForPlayerPhase(coopPage, 6, "decision"),
      waitForPlayerPhase(aggressivePage, 6, "decision"),
      waitForPlayerPhase(conservativePage, 6, "decision")
    ]);
    await snapshotAll("round-5-expired-on-resolve-round-6-open");

    appendSummary(runSummary, "round_6", "Completing the final round and capturing end-state artifacts");
    await submitDecision(coopPage, roles["student-coop"]);
    await submitDecision(aggressivePage, roles["student-aggressive"]);
    await submitDecision(conservativePage, roles["student-conservative"]);
    await clickButton(facilitatorPage, "Open Interaction");
    await Promise.all([
      waitForPlayerPhase(coopPage, 6, "interaction"),
      waitForPlayerPhase(aggressivePage, 6, "interaction"),
      waitForPlayerPhase(conservativePage, 6, "interaction")
    ]);

    await sendProposalUi(coopPage, {
      targetCompanyName: roles["student-aggressive"].companyName,
      interactionLabel: "Joint venture",
      intensity: 45,
      message: "Final-round collaboration to stabilize both firms."
    });
    await respondProposalUi(aggressivePage, {
      companyName: roles["student-coop"].companyName,
      interactionLabel: "Joint venture",
      actionLabel: "Reject"
    });
    await snapshotAll("round-6-joint-venture-rejected");

    await clickButton(facilitatorPage, "Resolve Round");
    await Promise.all([
      waitForCompleted(coopPage, 45000),
      waitForCompleted(aggressivePage, 45000),
      waitForCompleted(conservativePage, 45000)
    ]);
    await snapshot(facilitatorPage, "facilitator", "final-leaderboard");
    await snapshot(coopPage, "student-coop", "final-results-view");
    await snapshot(aggressivePage, "student-aggressive", "final-results-view");
    await snapshot(conservativePage, "student-conservative", "final-results-view");
  } catch (error) {
    runSummary.blocker = {
      at: nowIso(),
      message: error instanceof Error ? error.message : String(error)
    };
    writeJson(path.join(sharedDir, "blocker.json"), runSummary.blocker);
    for (const entry of allPages) {
      try {
        await snapshot(entry.page, entry.role, "blocker-state");
      } catch {
        // Best-effort capture.
      }
    }
    throw error;
  } finally {
    flushLogs();
    runSummary.completed_at = nowIso();
    writeJson(path.join(sharedDir, "run-summary.json"), runSummary);
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
