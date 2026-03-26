"use client";

import { CompanyPerformanceChart, PerformanceMetricKey } from "@/components/charts/company-performance-chart";
import { LeaderboardComparisonChart } from "@/components/charts/leaderboard-comparison-chart";
import { BreakingNewsPanel } from "@/components/ui/breaking-news-panel";
import { MessageCenterDrawer } from "@/components/ui/message-center-drawer";
import { RoundSnapshotCard } from "@/components/ui/round-snapshot-card";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { BUDGET_DESCRIPTIONS, FOCUS_ACTION_DESCRIPTIONS, RISK_POSTURE_DESCRIPTIONS, INTERACTION_DESCRIPTIONS } from "@/lib/game-descriptions";
import { MessageSquare, Target } from "lucide-react";
import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import {
  Company,
  FocusAction,
  InteractionProposal,
  MessageCenterFeed,
  RiskPosture,
  SessionResults,
  SessionState
} from "@/lib/types";
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

const focusActionLabels: Record<FocusAction, string> = {
  expand_market: "Expand market",
  improve_efficiency: "Improve efficiency",
  invest_people: "Invest in people",
  risk_mitigation: "Risk mitigation",
  brand_campaign: "Brand campaign"
};

const riskPostureLabels: Record<RiskPosture, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive"
};

const strengthMetricKeys: Array<Exclude<keyof Company["metrics"], "regulatory_risk">> = [
  "cash",
  "revenue_growth",
  "market_share",
  "talent_morale",
  "operational_resilience",
  "brand_reputation"
];

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

function formatRelativeExpiry(
  iso: string,
  status: "pending" | "accepted" | "rejected" | "countered" | "expired",
  currentTime: number
): string {
  const expiresAt = Date.parse(iso);
  if (Number.isNaN(expiresAt)) {
    return "Expiry unavailable";
  }

  if (status === "expired") {
    return `Expired ${formatDateTime(iso)}`;
  }

  const deltaMs = expiresAt - currentTime;
  if (deltaMs <= 0) {
    return "Past deadline, expires on resolve";
  }

  const deltaMinutes = Math.max(1, Math.ceil(deltaMs / 60000));
  if (deltaMinutes <= 2) {
    return `Expires in ${deltaMinutes} min`;
  }

  if (deltaMinutes <= 60) {
    return `Expires in ${deltaMinutes} min`;
  }

  return `Expires ${formatDateTime(iso)}`;
}

function formatSignedValue(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function pickMostCommon<T extends string>(values: T[]): T | null {
  if (values.length === 0) {
    return null;
  }

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let selected: T | null = null;
  let selectedCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > selectedCount) {
      selected = value;
      selectedCount = count;
    }
  }

  return selected;
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
  const [interactionExpiryMinutes, setInteractionExpiryMinutes] = useState(8);
  const [activeCounterProposalId, setActiveCounterProposalId] = useState<string | null>(null);
  const [counterIntensity, setCounterIntensity] = useState(40);
  const [counterMessage, setCounterMessage] = useState("");
  const [currentTime, setCurrentTime] = useState(Date.now());

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
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (state?.session.status === "completed") {
      setStatusMessage(null);
    }
  }, [state?.session.status]);

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
          },
          expires_in_minutes: interactionExpiryMinutes
        })
      });

      setStatusMessage("Interaction proposal sent.");
      setInteractionMessage("");
      setInteractionExpiryMinutes(8);
      setDrawerTab("outbox");
      await Promise.all([load(), refreshMessageFeed()]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send proposal");
    }
  }

  function beginCounterProposal(proposalId: string, startingIntensity: number): void {
    setActiveCounterProposalId(proposalId);
    setCounterIntensity(Math.max(10, Math.min(100, startingIntensity)));
    setCounterMessage("");
  }

  function cancelCounterProposal(): void {
    setActiveCounterProposalId(null);
    setCounterIntensity(40);
    setCounterMessage("");
  }

  async function respondToProposal(
    proposalId: string,
    response: "accept" | "reject" | "counter"
  ): Promise<void> {
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
          response,
          counter_terms:
            response === "counter"
              ? {
                  intensity: counterIntensity,
                  message: counterMessage.trim() || undefined
                }
              : undefined
        })
      });

      setStatusMessage(response === "counter" ? "Counterproposal sent." : `Proposal ${response}ed.`);
      if (response === "counter") {
        cancelCounterProposal();
        setDrawerTab("outbox");
      }
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
  const isCompleted = session.status === "completed";
  const playerValue = myLeaderboardEntry?.total_score ?? (mySeries?.points.at(-1)?.total_score ?? null);
  const companyNameById = new Map(state.companies.map((company) => [company.id, company.name]));
  const historyPoints = mySeries?.points || [];
  const openingPoint = historyPoints[0] ?? null;
  const closingPoint = historyPoints.at(-1) ?? null;
  const valueChange =
    openingPoint && closingPoint ? closingPoint.total_score - openingPoint.total_score : null;
  const bestRoundSwing = historyPoints.reduce<{ round: number; delta: number } | null>((best, point, index) => {
    if (index === 0) {
      return best;
    }

    const delta = point.total_score - historyPoints[index - 1].total_score;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) {
      return {
        round: point.round_number,
        delta
      };
    }

    return best;
  }, null);
  const strongestMetricKey = myCompany
    ? strengthMetricKeys.reduce((best, metricKey) => {
        if (!best || myCompany.metrics[metricKey] > myCompany.metrics[best]) {
          return metricKey;
        }
        return best;
      }, strengthMetricKeys[0])
    : null;
  const interactionStatusCounts = (messageFeed?.messages || []).reduce(
    (counts, message) => {
      counts[message.status] += 1;
      return counts;
    },
    {
      pending: 0,
      accepted: 0,
      rejected: 0,
      countered: 0,
      expired: 0
    }
  );
  const playerTimeline = (results?.decision_timeline || []).map((entry) => {
    const myDecision = myCompany
      ? entry.decisions.find((decision) => decision.company_id === myCompany.id) ?? null
      : null;
    const myInteractions = myCompany
      ? entry.interactions.filter(
          (interaction) =>
            interaction.proposer_company_id === myCompany.id || interaction.target_company_id === myCompany.id
        )
      : [];
    const myRank = myCompany
      ? entry.leaderboard.find((leaderboardEntry) => leaderboardEntry.company_id === myCompany.id) ?? null
      : null;

    return {
      ...entry,
      myDecision,
      myInteractions,
      myRank
    };
  });
  const dominantFocus = pickMostCommon(
    playerTimeline
      .map((entry) => entry.myDecision?.focus_action)
      .filter((value): value is FocusAction => Boolean(value))
  );
  const dominantRiskPosture = pickMostCommon(
    playerTimeline
      .map((entry) => entry.myDecision?.risk_posture)
      .filter((value): value is RiskPosture => Boolean(value))
  );
  const snapshotItems = isCompleted
    ? [
        {
          label: "Final Rank",
          value: myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : "N/A",
          tone: myLeaderboardEntry && myLeaderboardEntry.rank <= 2 ? ("good" as const) : ("default" as const)
        },
        {
          label: "Value Change",
          value: valueChange !== null ? formatSignedValue(valueChange) : "N/A",
          tone: valueChange !== null && valueChange >= 0 ? ("good" as const) : ("warn" as const)
        },
        {
          label: "Accepted Deals",
          value: String(interactionStatusCounts.accepted),
          tone: interactionStatusCounts.accepted > 0 ? ("good" as const) : ("muted" as const)
        },
        {
          label: "Risk Exposure",
          value: myCompany ? myCompany.metrics.regulatory_risk.toFixed(1) : "N/A",
          tone:
            myCompany && myCompany.metrics.regulatory_risk >= 55
              ? ("warn" as const)
              : ("default" as const)
        }
      ]
    : [
        {
          label: "Decision",
          value: hasSubmittedCurrentRound ? "Submitted" : "Pending",
          tone: hasSubmittedCurrentRound ? ("good" as const) : ("warn" as const)
        },
        {
          label: "Inbox Pending",
          value: String(pendingInboxCount),
          tone: pendingInboxCount > 0 ? ("warn" as const) : ("default" as const)
        },
        {
          label: "Round Phase",
          value: formatPhase(roundPhase),
          tone: "default" as const
        },
        {
          label: "Current Rank",
          value: myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : "N/A",
          tone: "default" as const
        }
      ];
  const interactionDesc = interactionType ? INTERACTION_DESCRIPTIONS[interactionType] : null;
  const drawerTabs = [
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
              <p className="small">{formatRelativeExpiry(message.expires_at, message.status, currentTime)}</p>
              <p className="small">Updated {formatDateTime(message.updated_at)}</p>
              {message.status === "pending" ? (
                <>
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
                      onClick={() => beginCounterProposal(message.proposal_id, message.terms.intensity)}
                    >
                      Counter
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
                  {activeCounterProposalId === message.proposal_id ? (
                    <form
                      className="drawer-form counter-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void respondToProposal(message.proposal_id, "counter");
                      }}
                    >
                      <label>
                        Counter intensity (10-100)
                        <input
                          type="number"
                          min={10}
                          max={100}
                          value={counterIntensity}
                          onChange={(event) => setCounterIntensity(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        Counter message
                        <textarea
                          rows={3}
                          value={counterMessage}
                          onChange={(event) => setCounterMessage(event.target.value)}
                          placeholder="What terms would make this acceptable?"
                        />
                      </label>
                      <div className="inline">
                        <button type="submit" disabled={Boolean(responseBlockedReason)}>
                          Send counter
                        </button>
                        <button type="button" className="secondary" onClick={() => cancelCounterProposal()}>
                          Cancel
                        </button>
                      </div>
                      <p className="small">
                        Counter offers keep the original expiry deadline. Expiry timing is not reset.
                      </p>
                    </form>
                  ) : null}
                </>
              ) : null}
              {message.status === "countered" ? (
                <p className="small">
                  This proposal was countered. Check your inbox or outbox for the returned offer.
                </p>
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
              <p className="small">{formatRelativeExpiry(message.expires_at, message.status, currentTime)}</p>
              <p className="small">Updated {formatDateTime(message.updated_at)}</p>
              {message.status === "countered" ? (
                <p className="small">A counteroffer was returned. Check your inbox to respond.</p>
              ) : null}
            </article>
          ))}
        </div>
      )
    },
    ...(!isCompleted
      ? [
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
                  {interactionDesc && (
                    <div style={{
                      background: interactionDesc.type === "cooperative" ? "rgba(0,212,255,0.04)" : "rgba(255,107,53,0.04)",
                      border: `1px solid ${interactionDesc.type === "cooperative" ? "rgba(0,212,255,0.2)" : "rgba(255,107,53,0.2)"}`,
                      borderRadius: "6px",
                      padding: "0.6rem 0.8rem",
                      marginTop: "0.4rem",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                        <span style={{
                          color: interactionDesc.type === "cooperative" ? "var(--cyan)" : "var(--warn)",
                          fontSize: "0.65rem",
                          letterSpacing: "0.08em",
                          fontFamily: "var(--font-mono)",
                          textTransform: "uppercase",
                        }}>
                          {interactionDesc.type}
                        </span>
                        <span style={{ color: "var(--muted)", fontSize: "0.68rem" }}>Who benefits: {interactionDesc.beneficiary}</span>
                      </div>
                      <p style={{ color: "var(--ink)", fontSize: "0.78rem", lineHeight: "1.5", margin: 0 }}>{interactionDesc.description}</p>
                      <p style={{ color: "var(--muted)", fontSize: "0.68rem", marginTop: "0.3rem", marginBottom: 0 }}>
                        Intensity affects: {interactionDesc.intensityNote}
                      </p>
                    </div>
                  )}

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
                    Expires in
                    <select
                      value={interactionExpiryMinutes}
                      onChange={(event) => setInteractionExpiryMinutes(Number(event.target.value))}
                    >
                      <option value={1}>1 minute</option>
                      <option value={3}>3 minutes</option>
                      <option value={5}>5 minutes</option>
                      <option value={8}>8 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                    </select>
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
                <p className="small">
                  Pending proposals expire after their deadline, and overdue proposals resolve as expired.
                </p>
                {interactionBlockedReason ? <p className="small">Locked: {interactionBlockedReason}</p> : null}
              </form>
            )
          }
        ]
      : [])
  ];
  const mainClassName = [
    "page",
    "dashboard-shell",
    "dashboard-context",
    "player-view",
    `phase-${roundPhase}`,
    `session-${session.status}`,
    isCompleted ? "mode-complete" : "mode-live"
  ].join(" ");

  return (
    <main className={mainClassName}>
      <section className="hero hero-dashboard">
        <div className="hero-main">
          <h1>
            <span className="callsign">Mission</span> Control
          </h1>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", letterSpacing: "0.08em", color: "var(--muted)" }}>
            SESSION <b style={{ color: "var(--accent)" }}>{session.code}</b>
            &nbsp;|&nbsp;
            ROUND <b style={{ color: "var(--ink)" }}>{session.current_round_number}</b> OF {session.total_rounds}
          </p>
          <p className="small hero-note">
            {isCompleted
              ? "Simulation complete. Review final standing, negotiation archive, and round-by-round story."
              : `Next action: ${nextAction}`}
          </p>

          {/* Round progress segments */}
          <div className="round-progress">
            <span className="round-progress-label">Progress</span>
            <div className="round-progress-segments">
              {Array.from({ length: session.total_rounds }, (_, i) => i + 1).map((r) => (
                <div
                  key={r}
                  className={`round-segment${r < session.current_round_number ? " filled" : r === session.current_round_number ? " current" : ""}`}
                />
              ))}
            </div>
            <span className="round-progress-label">{session.current_round_number}/{session.total_rounds}</span>
          </div>
        </div>

        <div className="hero-tools">
          <div className="inline">
            <span className={`badge status-${session.status}`}>{session.status.toUpperCase()}</span>
            <span className="badge">
              <Target size={10} />
              {formatPhase(roundPhase)}
            </span>
            <span className="badge" style={
              realtime.status === "live"
                ? { color: "var(--good)", borderColor: "rgba(0,230,118,0.3)", background: "var(--good-soft)" }
                : {}
            }>
              {realtime.status === "live" ? "◉ LIVE" : realtime.status === "connecting" ? "CONNECTING" : "OFFLINE"}
            </span>
          </div>

          {/* Rank badge if available */}
          {myLeaderboardEntry != null && results ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--muted)"
            }}>
              <span style={{ fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>Rank</span>
              <span style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "1.4rem",
                color: myLeaderboardEntry.rank === 1 ? "var(--accent)" : myLeaderboardEntry.rank === 2 ? "#c0c0c0" : myLeaderboardEntry.rank === 3 ? "#cd7f32" : "var(--ink)",
                lineHeight: 1
              }}>
                #{myLeaderboardEntry.rank}
              </span>
              <span style={{ color: "var(--muted)", fontSize: "0.68rem" }}>/ {results.leaderboard.length}</span>
            </div>
          ) : null}

          <button className="mail-button" onClick={() => setDrawerOpen(true)}>
            <MessageSquare size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
            Intel Center {pendingInboxCount > 0 ? `(${pendingInboxCount})` : ""}
          </button>
        </div>
      </section>

      <PhaseBanner
        phase={roundPhase}
        sessionStatus={sessionStatus}
        role="player"
        decisionsSubmitted={state?.decisions_submitted}
        totalPlayers={state?.players.length}
      />

      <section className="priority-grid">
        <RoundSnapshotCard
          title={isCompleted ? "Final Debrief" : "Mission Status"}
          subtitle={isCompleted ? `${myCompany?.name || "Company"} final state` : `Round ${session.current_round_number}`}
          items={snapshotItems.map((item) => ({
            label: item.label,
            value: item.value,
            tone: item.tone
          }))}
          currentRound={isCompleted ? session.total_rounds : session.current_round_number}
          totalRounds={session.total_rounds}
          footer={
            <p className="small">
              {isCompleted
                ? "The live controls are hidden now so the board reads as a debrief, not an active turn screen."
                : "Facilitator controls phase changes and round resolve timing."}
            </p>
          }
        />

        <BreakingNewsPanel
          event={state.current_event}
          roundNumber={currentRoundNumber}
          title={isCompleted ? "Final Round Trigger" : "Breaking News"}
        />
      </section>

      {isCompleted ? (
        <>
          <section className="hierarchy-grid two-col">
            <article className="card card-prominent debrief-summary">
              <div className="card-head">
                <h3>Strategy Profile</h3>
                <p className="small">A concise readout of how your company actually played the clinic.</p>
              </div>

              {myCompany ? (
                <>
                  <p className="debrief-headline">{myCompany.name}</p>
                  <p className="small">
                    {dominantFocus
                      ? `You leaned hardest on ${focusActionLabels[dominantFocus]}.`
                      : "Your decisions stayed mixed across the session."}{" "}
                    {dominantRiskPosture
                      ? `Most rounds used a ${riskPostureLabels[dominantRiskPosture].toLowerCase()} posture.`
                      : "Risk posture varied round to round."}
                  </p>

                  <div className="summary-strip">
                    <div className="summary-item">
                      <span className="small">Opening value</span>
                      <b>{openingPoint ? openingPoint.total_score.toFixed(2) : "N/A"}</b>
                    </div>
                    <div className="summary-item">
                      <span className="small">Final value</span>
                      <b>{playerValue !== null ? playerValue.toFixed(2) : "N/A"}</b>
                    </div>
                    <div className="summary-item">
                      <span className="small">Net change</span>
                      <b>{valueChange !== null ? formatSignedValue(valueChange) : "N/A"}</b>
                    </div>
                    <div className="summary-item">
                      <span className="small">Final rank</span>
                      <b>{myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : "N/A"}</b>
                    </div>
                  </div>

                  <div className="metrics-grid compact">
                    <div className="metric">
                      <span className="small">Strongest asset</span>
                      <b>{strongestMetricKey ? formatMetricLabel(strongestMetricKey) : "N/A"}</b>
                    </div>
                    <div className="metric">
                      <span className="small">Regulatory risk</span>
                      <b>{myCompany.metrics.regulatory_risk.toFixed(1)}</b>
                    </div>
                    <div className="metric">
                      <span className="small">Best swing</span>
                      <b>
                        {bestRoundSwing
                          ? `${formatSignedValue(bestRoundSwing.delta)} in R${bestRoundSwing.round}`
                          : "N/A"}
                      </b>
                    </div>
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
                <h3>Final Leaderboard</h3>
                <p className="small">Use the closing order to compare strategy quality against the market context.</p>
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
                <h3>Negotiation Record</h3>
                <p className="small">Review how often your proposals landed, stalled, or returned as counters.</p>
              </div>
              <div className="summary-strip">
                <div className="summary-item">
                  <span className="small">Accepted</span>
                  <b>{interactionStatusCounts.accepted}</b>
                </div>
                <div className="summary-item">
                  <span className="small">Rejected</span>
                  <b>{interactionStatusCounts.rejected}</b>
                </div>
                <div className="summary-item">
                  <span className="small">Countered</span>
                  <b>{interactionStatusCounts.countered}</b>
                </div>
                <div className="summary-item">
                  <span className="small">Expired</span>
                  <b>{interactionStatusCounts.expired}</b>
                </div>
              </div>
              <p className="small">
                Compose actions are closed after completion, but the full inbox and outbox remain available as a negotiation archive.
              </p>
              <button onClick={() => setDrawerOpen(true)}>Review Message Center</button>
            </article>

            <article className="card assets-card">
              <div className="card-head">
                <h3>Final Company Metrics</h3>
                <p className="small">The closing numbers explain why your value curve landed where it did.</p>
              </div>

              {myCompany ? (
                <>
                  <p className="assets-name">{myCompany.name}</p>
                  <p className="assets-value">
                    Final value <b>{playerValue !== null ? playerValue.toFixed(2) : "N/A"}</b>
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
                <p className="small">Identity is not connected for metric review.</p>
              )}
            </article>
          </section>

          <section className="card timeline-card">
            <div className="card-head split">
              <div>
                <h3>Round-by-Round Debrief</h3>
                <p className="small">Trace each event, your decision, and the resulting negotiation pressure.</p>
              </div>
              <span className="badge">Rounds: {playerTimeline.length}</span>
            </div>

            <div className="timeline-list">
              {playerTimeline.map((entry) => {
                const roundInteractionSummary = entry.myInteractions.reduce(
                  (counts, interaction) => {
                    counts[interaction.status] = (counts[interaction.status] || 0) + 1;
                    return counts;
                  },
                  {} as Record<string, number>
                );

                return (
                  <article className="timeline-entry" key={entry.round_number}>
                    <div className="timeline-topline">
                      <span className="badge">Round {entry.round_number}</span>
                      <span className="small">
                        {entry.event.category.toUpperCase()} | {entry.event.severity.toUpperCase()}
                      </span>
                    </div>
                    <h4>{entry.event.title}</h4>
                    <p className="small">{entry.event.narrative}</p>
                    <p className="small">
                      Decision:{" "}
                      {entry.myDecision
                        ? `${focusActionLabels[entry.myDecision.focus_action]} with ${riskPostureLabels[entry.myDecision.risk_posture].toLowerCase()} risk`
                        : "No decision captured"}
                    </p>
                    <div className="timeline-stats">
                      <span>
                        Rank {entry.myRank ? `#${entry.myRank.rank}` : "N/A"}
                      </span>
                      <span>
                        Value {entry.myRank ? entry.myRank.total_score.toFixed(2) : "N/A"}
                      </span>
                      <span>Deals {entry.myInteractions.length}</span>
                      <span>Accepted {roundInteractionSummary.accepted || 0}</span>
                    </div>
                    <p className="small">
                      Counterparties:{" "}
                      {entry.myInteractions.length > 0
                        ? entry.myInteractions
                            .map((interaction) =>
                              companyNameById.get(
                                interaction.proposer_company_id === myCompany?.id
                                  ? interaction.target_company_id
                                  : interaction.proposer_company_id
                              ) ||
                              (interaction.proposer_company_id === myCompany?.id
                                ? interaction.target_company_id
                                : interaction.proposer_company_id)
                            )
                            .join(", ")
                        : "No direct negotiations"}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          {roundPhase === "resolved" && (mySeries?.points.length ?? 0) >= 2 && (() => {
            const points = mySeries!.points;
            const prev = points[points.length - 2];
            const curr = points[points.length - 1];
            const metricKeys = Object.keys(curr.metrics) as Array<keyof typeof curr.metrics>;
            return (
              <section className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ marginBottom: "0.2rem" }}>Round Outcome</h3>
                {state?.current_event?.event && (
                  <p className="small" style={{ color: "var(--muted)", marginBottom: "0.8rem" }}>
                    Event: <span style={{ color: "var(--accent)" }}>{state.current_event.event.title}</span>
                  </p>
                )}
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {metricKeys.map((key) => {
                    const prevVal = prev.metrics[key];
                    const currVal = curr.metrics[key];
                    const delta = currVal - prevVal;
                    const isInverted = key === "regulatory_risk";
                    const deltaColor = isInverted
                      ? (delta > 0 ? "var(--warn)" : delta < 0 ? "var(--good)" : "var(--muted)")
                      : (delta > 0 ? "var(--good)" : delta < 0 ? "var(--warn)" : "var(--muted)");
                    const deltaStr = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
                    return (
                      <div key={key}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.85rem" }}>{formatMetricLabel(key)}</span>
                          <span style={{ color: deltaColor, fontFamily: "var(--font-mono)", fontWeight: "700" }}>
                            {delta === 0 ? "—" : deltaStr}
                          </span>
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: "0.72rem", paddingLeft: "0.5rem" }}>
                          Round {prev.round_number}: {prevVal.toFixed(1)} → {currVal.toFixed(1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

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
                        {BUDGET_DESCRIPTIONS[key as keyof typeof BUDGET_DESCRIPTIONS] && (
                          <p className="small" style={{ color: "var(--muted)", marginTop: "0.2rem", lineHeight: "1.4" }}>
                            {BUDGET_DESCRIPTIONS[key as keyof typeof BUDGET_DESCRIPTIONS]}
                          </p>
                        )}
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
                    {focusAction && FOCUS_ACTION_DESCRIPTIONS[focusAction] && (
                      <p className="small" style={{ color: "var(--muted)", marginTop: "0.3rem", lineHeight: "1.4" }}>
                        {FOCUS_ACTION_DESCRIPTIONS[focusAction]}
                      </p>
                    )}
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
                    {riskPosture && RISK_POSTURE_DESCRIPTIONS[riskPosture] && (
                      <p className="small" style={{ color: "var(--muted)", marginTop: "0.3rem", lineHeight: "1.4" }}>
                        {RISK_POSTURE_DESCRIPTIONS[riskPosture]}
                      </p>
                    )}
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
                <p className="small">Use inbox, outbox, and compose to manage proposals, counters, and expiry windows.</p>
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
                <div className="metric">
                  <span className="small">Accepted Deals</span>
                  <b>{interactionStatusCounts.accepted}</b>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(true)}>Open Message Center</button>
            </article>
          </section>
        </>
      )}

      {statusMessage ? <p className="notice">{statusMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <MessageCenterDrawer
        open={drawerOpen}
        title={isCompleted ? "Negotiation Archive" : "Session Message Center"}
        subtitle={
          myCompany
            ? isCompleted
              ? `${myCompany.name} | archived negotiation history`
              : myCompany.name
            : "Identity not connected"
        }
        activeTabId={drawerTab}
        onTabChange={(tabId) => setDrawerTab(tabId as typeof drawerTab)}
        onClose={() => setDrawerOpen(false)}
        tabs={drawerTabs}
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
