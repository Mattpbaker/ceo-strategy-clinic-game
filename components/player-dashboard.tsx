"use client";

import { CompanyPerformanceChart, PerformanceMetricKey } from "@/components/charts/company-performance-chart";
import { LeaderboardComparisonChart } from "@/components/charts/leaderboard-comparison-chart";
import { BreakingNewsPanel } from "@/components/ui/breaking-news-panel";
import { MessageCenterDrawer } from "@/components/ui/message-center-drawer";
import { RoundSnapshotCard } from "@/components/ui/round-snapshot-card";
import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import { Company, InteractionProposal, MessageCenterFeed, SessionResults, SessionState } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface PlayerDashboardProps {
  sessionRef: string;
}

type InteractionType = InteractionProposal["type"];

const interactionTypeLabels: Record<InteractionType, string> = {
  trade_contract: "Trade contract",
  joint_venture: "Joint venture",
  price_war: "Price war",
  talent_poach: "Talent poach",
  reputation_challenge: "Reputation challenge"
};

function formatPhase(phase: string | null | undefined): string {
  if (!phase) {
    return "Unavailable";
  }

  switch (phase) {
    case "pending":
      return "Pending";
    case "decision":
      return "Decision";
    case "interaction":
      return "Interaction";
    case "resolved":
      return "Resolved";
    default:
      return phase;
  }
}

function formatMetricLabel(metric: string): string {
  return metric
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function PlayerDashboard({ sessionRef }: PlayerDashboardProps): React.ReactElement {
  const searchParams = useSearchParams();

  const [playerId, setPlayerId] = useState(searchParams.get("playerId") || "");
  const [state, setState] = useState<SessionState | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [submittedRounds, setSubmittedRounds] = useState<number[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<PerformanceMetricKey>("total_score");

  const [budget, setBudget] = useState({
    growth: 20,
    people: 20,
    resilience: 20,
    brand: 20,
    compliance: 20
  });
  const [focusAction, setFocusAction] = useState<
    "expand_market" | "improve_efficiency" | "invest_people" | "risk_mitigation" | "brand_campaign"
  >("improve_efficiency");
  const [riskPosture, setRiskPosture] = useState<"conservative" | "balanced" | "aggressive">("balanced");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"inbox" | "outbox" | "compose">("inbox");
  const [messageFeed, setMessageFeed] = useState<MessageCenterFeed | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [interactionType, setInteractionType] = useState<InteractionType>("trade_contract");
  const [interactionIntensity, setInteractionIntensity] = useState(50);
  const [interactionMessage, setInteractionMessage] = useState("");

  const decisionStorageKey = useMemo(() => {
    const normalized = playerId.trim();
    if (!normalized) {
      return null;
    }
    return `ceo-clinic:${sessionRef}:player:${normalized}:decision-rounds`;
  }, [playerId, sessionRef]);

  const load = useCallback(async () => {
    try {
      const [sessionState, sessionResults] = await Promise.all([
        fetchApi<SessionState>(`/api/sessions/${sessionRef}/state`),
        fetchApi<SessionResults>(`/api/sessions/${sessionRef}/results`)
      ]);

      setState(sessionState);
      setResults(sessionResults);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load session state");
    }
  }, [sessionRef]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!decisionStorageKey) {
      setSubmittedRounds([]);
      return;
    }

    const raw = localStorage.getItem(decisionStorageKey);
    if (!raw) {
      setSubmittedRounds([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setSubmittedRounds([]);
        return;
      }
      setSubmittedRounds(parsed.filter((entry): entry is number => typeof entry === "number"));
    } catch {
      setSubmittedRounds([]);
    }
  }, [decisionStorageKey]);

  const realtimeTables = useMemo(
    () => [
      "sessions",
      "companies",
      "rounds",
      "round_events",
      "decisions",
      "interaction_proposals",
      "score_snapshots",
      "company_metric_snapshots"
    ],
    []
  );

  const realtime = useSessionRealtime({
    sessionId: state?.session.id,
    channelKey: "player-live",
    tables: realtimeTables,
    onChange: load
  });

  const myCompany = useMemo(() => {
    if (!state || !playerId.trim()) {
      return null;
    }
    return state.companies.find((company) => company.player_id === playerId.trim()) ?? null;
  }, [playerId, state]);

  useEffect(() => {
    if (!state || playerId.trim()) {
      return;
    }

    const raw = localStorage.getItem(`ceo-clinic:${state.session.id}:player`);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { playerId?: string; sessionCode?: string };
      if (!parsed.playerId) {
        return;
      }
      if (parsed.sessionCode && parsed.sessionCode.toUpperCase() !== state.session.code.toUpperCase()) {
        return;
      }
      setPlayerId(parsed.playerId);
    } catch {
      // Ignore malformed player identity cache.
    }
  }, [playerId, state]);

  const currentRound = state?.current_round ?? null;
  const currentRoundNumber = currentRound?.round_number ?? state?.session.current_round_number ?? null;
  const roundPhase = currentRound?.phase ?? "pending";
  const sessionStatus = state?.session.status ?? "waiting";
  const sessionAcceptsActions = sessionStatus === "running" || sessionStatus === "paused";
  const decisionWindowOpen = roundPhase === "decision" || roundPhase === "interaction";
  const interactionWindowOpen = decisionWindowOpen;

  const hasSubmittedCurrentRound =
    currentRoundNumber !== null && submittedRounds.includes(currentRoundNumber);

  const mySeries = useMemo(() => {
    if (!results || !myCompany) {
      return null;
    }
    return results.performance_series.find((entry) => entry.company_id === myCompany.id) ?? null;
  }, [myCompany, results]);

  const myLeaderboardEntry = useMemo(() => {
    if (!results || !myCompany) {
      return null;
    }
    return results.leaderboard.find((entry) => entry.company_id === myCompany.id) ?? null;
  }, [results, myCompany]);

  const otherCompanies = useMemo(() => {
    if (!state || !myCompany) {
      return [];
    }
    return state.companies.filter((company) => company.id !== myCompany.id);
  }, [myCompany, state]);

  useEffect(() => {
    if (!targetCompanyId && otherCompanies.length > 0) {
      setTargetCompanyId(otherCompanies[0].id);
    }
  }, [otherCompanies, targetCompanyId]);

  const decisionBlockedReason = useMemo(() => {
    if (!myCompany) {
      return "Connect your identity from Message Center settings first.";
    }
    if (!currentRound) {
      return "No active round is available yet.";
    }
    if (!sessionAcceptsActions) {
      return "Decisions are locked because the session is not active.";
    }
    if (!decisionWindowOpen) {
      return "Decisions open during decision or interaction phases.";
    }
    return null;
  }, [currentRound, decisionWindowOpen, myCompany, sessionAcceptsActions]);

  const interactionBlockedReason = useMemo(() => {
    if (!myCompany) {
      return "Connect your identity from Message Center settings first.";
    }
    if (!currentRound) {
      return "No active round is available yet.";
    }
    if (!sessionAcceptsActions) {
      return "Interactions are locked because the session is not active.";
    }
    if (!interactionWindowOpen) {
      return "Interactions open during decision or interaction phases.";
    }
    if (otherCompanies.length === 0) {
      return "At least one other company is required to send a proposal.";
    }
    if (!targetCompanyId) {
      return "Select a target company.";
    }
    return null;
  }, [
    currentRound,
    interactionWindowOpen,
    myCompany,
    otherCompanies.length,
    sessionAcceptsActions,
    targetCompanyId
  ]);

  const responseBlockedReason = useMemo(() => {
    if (!myCompany) {
      return "Connect your identity to respond.";
    }
    if (!sessionAcceptsActions) {
      return "Responses are locked because the session is not active.";
    }
    if (!currentRound) {
      return "No active round is available yet.";
    }
    return null;
  }, [currentRound, myCompany, sessionAcceptsActions]);

  const nextAction = useMemo(() => {
    if (!myCompany) {
      return "Open Message Center and use Change identity to connect your company.";
    }
    if (sessionStatus === "waiting") {
      return "Waiting for facilitator to start the session.";
    }
    if (sessionStatus === "completed") {
      return "Session completed. Review final leaderboard and timeline.";
    }
    if (!hasSubmittedCurrentRound) {
      return "Submit your strategy decision for this round.";
    }
    if (roundPhase === "interaction") {
      return "Use Message Center to send/respond to proposals before resolve.";
    }
    return "Awaiting facilitator phase updates.";
  }, [hasSubmittedCurrentRound, myCompany, roundPhase, sessionStatus]);

  const budgetTotal =
    budget.growth + budget.people + budget.resilience + budget.brand + budget.compliance;

  const refreshMessageFeed = useCallback(async () => {
    if (!myCompany) {
      setMessageFeed(null);
      return;
    }

    setMessageLoading(true);
    try {
      const params = new URLSearchParams({
        company_id: myCompany.id,
        direction: "all",
        limit: "500"
      });
      const feed = await fetchApi<MessageCenterFeed>(
        `/api/sessions/${sessionRef}/messages?${params.toString()}`
      );
      setMessageFeed(feed);
    } catch (feedError) {
      setError(feedError instanceof Error ? feedError.message : "Unable to load message center");
    } finally {
      setMessageLoading(false);
    }
  }, [myCompany, sessionRef]);

  useEffect(() => {
    void refreshMessageFeed();
  }, [refreshMessageFeed, state]);

  const inboxMessages = useMemo(
    () => (messageFeed?.messages || []).filter((message) => message.direction === "inbox"),
    [messageFeed]
  );

  const outboxMessages = useMemo(
    () => (messageFeed?.messages || []).filter((message) => message.direction === "outbox"),
    [messageFeed]
  );

  const pendingInboxCount = useMemo(
    () => inboxMessages.filter((message) => message.status === "pending").length,
    [inboxMessages]
  );

  useEffect(() => {
    if (!state || !myCompany) {
      return;
    }

    const payload = {
      coordinate_system: "No spatial coordinates. Turn-based strategic simulation.",
      session_status: state.session.status,
      round_number: state.session.current_round_number,
      round_phase: state.current_round?.phase,
      next_action: nextAction,
      decision_submitted_this_round: hasSubmittedCurrentRound,
      decision_window_open: decisionWindowOpen,
      interaction_window_open: interactionWindowOpen,
      pending_inbox_count: pendingInboxCount,
      player_company: {
        id: myCompany.id,
        name: myCompany.name,
        metrics: myCompany.metrics
      }
    };

    (window as Window & { render_game_to_text?: () => string }).render_game_to_text =
      () => JSON.stringify(payload);

    (window as Window & { advanceTime?: (ms: number) => void }).advanceTime = (_ms: number) => {
      void load();
    };
  }, [
    decisionWindowOpen,
    hasSubmittedCurrentRound,
    interactionWindowOpen,
    load,
    myCompany,
    nextAction,
    pendingInboxCount,
    state
  ]);

  function persistSubmittedRound(roundNumber: number): void {
    setSubmittedRounds((previous) => {
      if (previous.includes(roundNumber)) {
        return previous;
      }
      const next = [...previous, roundNumber].sort((a, b) => a - b);
      if (decisionStorageKey) {
        localStorage.setItem(decisionStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!state?.current_round || !playerId.trim()) {
      setError(decisionBlockedReason || "Missing player or round context");
      return;
    }
    if (decisionBlockedReason) {
      setError(decisionBlockedReason);
      return;
    }

    try {
      await fetchApi(`/api/rounds/${state.current_round.id}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          player_id: playerId.trim(),
          budget_split: budget,
          focus_action: focusAction,
          risk_posture: riskPosture
        })
      });
      persistSubmittedRound(state.current_round.round_number);
      setStatusMessage("Decision submitted. You can update it before resolve.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit decision");
    }
  }

  async function sendInteraction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!state?.current_round || !myCompany || !targetCompanyId) {
      setError(interactionBlockedReason || "Interaction requires an active round and target company");
      return;
    }
    if (interactionBlockedReason) {
      setError(interactionBlockedReason);
      return;
    }

    try {
      await fetchApi(`/api/interactions/proposals`, {
        method: "POST",
        body: JSON.stringify({
          session_id: state.session.id,
          round_id: state.current_round.id,
          proposer_company_id: myCompany.id,
          target_company_id: targetCompanyId,
          type: interactionType,
          terms: {
            intensity: interactionIntensity,
            message: interactionMessage.trim() || undefined
          }
        })
      });

      setStatusMessage("Interaction proposal sent.");
      setInteractionMessage("");
      setDrawerTab("outbox");
      await Promise.all([load(), refreshMessageFeed()]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send proposal");
    }
  }

  async function respondToProposal(proposalId: string, response: "accept" | "reject"): Promise<void> {
    if (!myCompany) {
      return;
    }
    if (responseBlockedReason) {
      setError(responseBlockedReason);
      return;
    }

    try {
      await fetchApi(`/api/interactions/${proposalId}/respond`, {
        method: "POST",
        body: JSON.stringify({
          responder_company_id: myCompany.id,
          response
        })
      });

      setStatusMessage(`Proposal ${response}ed.`);
      await Promise.all([load(), refreshMessageFeed()]);
    } catch (respondError) {
      setError(respondError instanceof Error ? respondError.message : "Unable to respond to proposal");
    }
  }

  if (!state) {
    return (
      <main className="page">
        <p>Loading session...</p>
      </main>
    );
  }

  const session = state.session;
  const playerValue = myLeaderboardEntry?.total_score ?? (mySeries?.points.at(-1)?.total_score ?? null);

  const snapshotItems = [
    {
      label: "Decision",
      value: hasSubmittedCurrentRound ? "Submitted" : "Pending",
      tone: hasSubmittedCurrentRound ? "good" : "warn"
    },
    {
      label: "Inbox Pending",
      value: String(pendingInboxCount),
      tone: pendingInboxCount > 0 ? "warn" : "default"
    },
    {
      label: "Round Phase",
      value: formatPhase(roundPhase),
      tone: "default"
    },
    {
      label: "Current Rank",
      value: myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : "N/A",
      tone: "default"
    }
  ] as const;

  return (
    <main className="page dashboard-shell">
      <section className="hero hero-dashboard">
        <div className="hero-main">
          <h1>Player Dashboard</h1>
          <p>
            Session <b>{session.code}</b> | Round {session.current_round_number} of {session.total_rounds}
          </p>
          <p className="small hero-note">Next action: {nextAction}</p>
        </div>
        <div className="hero-tools">
          <div className="inline">
            <span className={`badge status-${session.status}`}>{session.status.toUpperCase()}</span>
            <span className="badge">Phase: {formatPhase(roundPhase)}</span>
            <span className="badge">
              Realtime:{" "}
              {realtime.status === "live"
                ? "Live"
                : realtime.status === "connecting"
                  ? "Connecting"
                  : realtime.backoffMs
                    ? `Offline (${Math.ceil(realtime.backoffMs / 1000)}s)`
                    : "Offline"}
            </span>
          </div>
          <button className="mail-button" onClick={() => setDrawerOpen(true)}>
            {"\u2709"} Message Center {pendingInboxCount > 0 ? `(${pendingInboxCount})` : ""}
          </button>
        </div>
      </section>

      <section className="priority-grid">
        <RoundSnapshotCard
          title="Round Snapshot"
          subtitle={`Round ${session.current_round_number}`}
          items={snapshotItems.map((item) => ({
            label: item.label,
            value: item.value,
            tone: item.tone
          }))}
          footer={<p className="small">Facilitator controls phase changes and resolve timing.</p>}
        />

        <BreakingNewsPanel event={state.current_event} roundNumber={currentRoundNumber} />
      </section>

      <section className="hierarchy-grid two-col">
        <article className="card assets-card">
          <div className="card-head">
            <h3>Company Assets and Current Value</h3>
            <p className="small">Identity is managed from Message Center settings.</p>
          </div>

          {myCompany ? (
            <>
              <p className="assets-name">{myCompany.name}</p>
              <p className="assets-value">
                Value <b>{playerValue !== null ? playerValue.toFixed(2) : "N/A"}</b>
              </p>
              <div className="metrics-grid compact">
                {Object.entries(myCompany.metrics).map(([key, value]) => (
                  <div className="metric" key={key}>
                    <span className="small">{formatMetricLabel(key)}</span>
                    <b>{value.toFixed(1)}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="small">Open Message Center and use Change identity to connect your company.</p>
          )}
        </article>

        <CompanyPerformanceChart
          series={mySeries}
          metric={selectedMetric}
          onMetricChange={setSelectedMetric}
        />
      </section>

      <section className="hierarchy-grid two-col">
        <article className="card">
          <div className="card-head">
            <h3>Leaderboard</h3>
            <p className="small">Company value is based on total score each round.</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Company</th>
                <th>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {(results?.leaderboard || []).map((entry) => {
                const company = state.companies.find((item) => item.id === entry.company_id);
                return (
                  <tr key={entry.company_id}>
                    <td>#{entry.rank}</td>
                    <td>{company?.name || entry.company_id}</td>
                    <td>{entry.total_score.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>

        <LeaderboardComparisonChart
          series={results?.performance_series || []}
          leaderboard={results?.leaderboard || []}
        />
      </section>

      <section className="hierarchy-grid two-col action-grid">
        <article className="card">
          <div className="card-head">
            <h3>Strategy Decision</h3>
            <p className="small">Budget totals are normalized to 100% by the resolver.</p>
          </div>
          <form onSubmit={submitDecision}>
            <fieldset className="form-fieldset" disabled={Boolean(decisionBlockedReason)}>
              <div className="metrics-grid compact">
                {Object.entries(budget).map(([key, value]) => (
                  <label key={key}>
                    {formatMetricLabel(key)}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={value}
                      onChange={(event) =>
                        setBudget((prev) => ({
                          ...prev,
                          [key]: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <label>
                Focus action
                <select
                  value={focusAction}
                  onChange={(event) => setFocusAction(event.target.value as typeof focusAction)}
                >
                  <option value="expand_market">Expand market</option>
                  <option value="improve_efficiency">Improve efficiency</option>
                  <option value="invest_people">Invest in people</option>
                  <option value="risk_mitigation">Risk mitigation</option>
                  <option value="brand_campaign">Brand campaign</option>
                </select>
              </label>

              <label>
                Risk posture
                <select
                  value={riskPosture}
                  onChange={(event) => setRiskPosture(event.target.value as typeof riskPosture)}
                >
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>

              <button type="submit">
                {hasSubmittedCurrentRound ? "Update decision" : "Submit decision"}
              </button>
            </fieldset>
          </form>
          <p className="small">Budget total: {budgetTotal}%</p>
          {decisionBlockedReason ? <p className="small">Locked: {decisionBlockedReason}</p> : null}
        </article>

        <article className="card">
          <div className="card-head">
            <h3>Message Center</h3>
            <p className="small">Use inbox/outbox/compose to manage all interaction proposals.</p>
          </div>
          <div className="metrics-grid compact">
            <div className="metric">
              <span className="small">Inbox</span>
              <b>{inboxMessages.length}</b>
            </div>
            <div className="metric">
              <span className="small">Outbox</span>
              <b>{outboxMessages.length}</b>
            </div>
            <div className="metric">
              <span className="small">Pending Inbox</span>
              <b>{pendingInboxCount}</b>
            </div>
          </div>
          <button onClick={() => setDrawerOpen(true)}>Open Message Center</button>
        </article>
      </section>

      {session.status === "completed" ? (
        <section className="card">
          <h3>Decision Timeline</h3>
          {(results?.decision_timeline || []).map((entry) => (
            <div className="notice" key={entry.round_number}>
              <p>
                <b>Round {entry.round_number}</b> - {entry.event.title} ({entry.event.category},{" "}
                {entry.event.severity})
              </p>
              <p className="small">{entry.event.narrative}</p>
              <p className="small">
                Decisions: {entry.decisions.length} | Interactions: {entry.interactions.length}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {statusMessage ? <p className="notice">{statusMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <MessageCenterDrawer
        open={drawerOpen}
        title="Session Message Center"
        subtitle={myCompany ? myCompany.name : "Identity not connected"}
        activeTabId={drawerTab}
        onTabChange={(tabId) => setDrawerTab(tabId as typeof drawerTab)}
        onClose={() => setDrawerOpen(false)}
        tabs={[
          {
            id: "inbox",
            label: "Inbox",
            count: inboxMessages.length,
            content: (
              <div className="message-list">
                {messageLoading ? <p className="small">Loading inbox...</p> : null}
                {inboxMessages.length === 0 ? <p className="small">No inbox messages.</p> : null}
                {inboxMessages.map((message) => (
                  <article className="message-item" key={message.proposal_id}>
                    <div className="message-head">
                      <p>
                        <b>{interactionTypeLabels[message.type]}</b> from {message.proposer_company_name}
                      </p>
                      <span className={`badge status-${message.status}`}>{message.status.toUpperCase()}</span>
                    </div>
                    <p className="small">Round {message.round_number ?? "?"}</p>
                    <p className="small">Intensity: {message.terms.intensity}</p>
                    {message.terms.message ? <p className="small">&quot;{message.terms.message}&quot;</p> : null}
                    <p className="small">Updated {formatDateTime(message.updated_at)}</p>
                    {message.status === "pending" ? (
                      <div className="inline">
                        <button
                          type="button"
                          disabled={Boolean(responseBlockedReason)}
                          onClick={() => void respondToProposal(message.proposal_id, "accept")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={Boolean(responseBlockedReason)}
                          onClick={() => void respondToProposal(message.proposal_id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
                {responseBlockedReason ? <p className="small">Locked: {responseBlockedReason}</p> : null}
              </div>
            )
          },
          {
            id: "outbox",
            label: "Outbox",
            count: outboxMessages.length,
            content: (
              <div className="message-list">
                {messageLoading ? <p className="small">Loading outbox...</p> : null}
                {outboxMessages.length === 0 ? <p className="small">No outbox messages.</p> : null}
                {outboxMessages.map((message) => (
                  <article className="message-item" key={message.proposal_id}>
                    <div className="message-head">
                      <p>
                        <b>{interactionTypeLabels[message.type]}</b> to {message.target_company_name}
                      </p>
                      <span className={`badge status-${message.status}`}>{message.status.toUpperCase()}</span>
                    </div>
                    <p className="small">Round {message.round_number ?? "?"}</p>
                    <p className="small">Intensity: {message.terms.intensity}</p>
                    {message.terms.message ? <p className="small">&quot;{message.terms.message}&quot;</p> : null}
                    <p className="small">Updated {formatDateTime(message.updated_at)}</p>
                  </article>
                ))}
              </div>
            )
          },
          {
            id: "compose",
            label: "Compose",
            content: (
              <form onSubmit={sendInteraction} className="drawer-form">
                <fieldset className="form-fieldset" disabled={Boolean(interactionBlockedReason)}>
                  <label>
                    Target company
                    <select
                      value={targetCompanyId}
                      onChange={(event) => setTargetCompanyId(event.target.value)}
                      required
                    >
                      <option value="">Select company</option>
                      {otherCompanies.map((company: Company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Interaction type
                    <select
                      value={interactionType}
                      onChange={(event) => setInteractionType(event.target.value as InteractionType)}
                    >
                      <option value="trade_contract">Trade contract</option>
                      <option value="joint_venture">Joint venture</option>
                      <option value="price_war">Price war</option>
                      <option value="talent_poach">Talent poach</option>
                      <option value="reputation_challenge">Reputation challenge</option>
                    </select>
                  </label>

                  <label>
                    Intensity (10-100)
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={interactionIntensity}
                      onChange={(event) => setInteractionIntensity(Number(event.target.value))}
                    />
                  </label>

                  <label>
                    Message (optional)
                    <textarea
                      rows={3}
                      value={interactionMessage}
                      onChange={(event) => setInteractionMessage(event.target.value)}
                      placeholder="What terms are you proposing?"
                    />
                  </label>

                  <button type="submit">Send proposal</button>
                </fieldset>
                {interactionBlockedReason ? <p className="small">Locked: {interactionBlockedReason}</p> : null}
              </form>
            )
          }
        ]}
        footer={
          <details className="identity-disclosure">
            <summary>Change identity / recovery</summary>
            <label>
              Player ID
              <input
                value={playerId}
                onChange={(event) => setPlayerId(event.target.value)}
                placeholder="Paste player ID from join redirect"
              />
            </label>
            <p className="small">Use only if your URL player ID is missing or incorrect.</p>
          </details>
        }
      />
    </main>
  );
}
