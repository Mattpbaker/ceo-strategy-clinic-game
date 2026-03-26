"use client";

import { LeaderboardComparisonChart } from "@/components/charts/leaderboard-comparison-chart";
import { BreakingNewsPanel } from "@/components/ui/breaking-news-panel";
import { MessageCenterDrawer } from "@/components/ui/message-center-drawer";
import { RoundSnapshotCard } from "@/components/ui/round-snapshot-card";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { EVENT_PRESETS, EventPreset } from "@/lib/event-presets";
import { Activity, MessageSquare, Trophy, Users, Zap } from "lucide-react";
import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import { MessageCenterFeed, SessionResults, SessionState } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface FacilitatorDashboardProps {
  sessionRef: string;
}

type FacilitatorControlAction = "start" | "pause" | "resume" | "advance_to_interaction";
type FacilitatorMutationAction = FacilitatorControlAction | "resolve_round" | "inject_event";

interface EventEffectInputs {
  cash: string;
  revenue_growth: string;
  market_share: string;
  talent_morale: string;
  operational_resilience: string;
  brand_reputation: string;
  regulatory_risk: string;
}

const emptyEffects: EventEffectInputs = {
  cash: "",
  revenue_growth: "",
  market_share: "",
  talent_morale: "",
  operational_resilience: "",
  brand_reputation: "",
  regulatory_risk: ""
};

const effectBounds: Record<keyof EventEffectInputs, { min: number; max: number }> = {
  cash: { min: -60, max: 60 },
  revenue_growth: { min: -25, max: 25 },
  market_share: { min: -25, max: 25 },
  talent_morale: { min: -30, max: 30 },
  operational_resilience: { min: -30, max: 30 },
  brand_reputation: { min: -30, max: 30 },
  regulatory_risk: { min: -30, max: 30 }
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

function formatActionLabel(action: FacilitatorMutationAction): string {
  switch (action) {
    case "start":
      return "Start session";
    case "pause":
      return "Pause session";
    case "resume":
      return "Resume session";
    case "advance_to_interaction":
      return "Open interaction";
    case "resolve_round":
      return "Resolve round";
    case "inject_event":
      return "Inject event";
    default:
      return action;
  }
}

export function FacilitatorDashboard({ sessionRef }: FacilitatorDashboardProps): React.ReactElement {
  const searchParams = useSearchParams();

  const [state, setState] = useState<SessionState | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [facilitatorToken, setFacilitatorToken] = useState("");
  const [pendingAction, setPendingAction] = useState<FacilitatorMutationAction | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const [messageFeed, setMessageFeed] = useState<MessageCenterFeed | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  const [eventCategory, setEventCategory] = useState<"economic" | "social" | "political">("economic");
  const [eventSeverity, setEventSeverity] = useState<"low" | "medium" | "high">("medium");
  const [eventTitle, setEventTitle] = useState("Strategic Shock");
  const [eventNarrative, setEventNarrative] = useState(
    "A sudden external shift pressures company strategy and execution."
  );
  const [eventEffects, setEventEffects] = useState<EventEffectInputs>(emptyEffects);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<"all" | "economic" | "social" | "political">("all");

  useEffect(() => {
    const tokenFromQuery = searchParams.get("token")?.trim() || "";
    const tokenFromStorage = localStorage.getItem(`ceo-clinic:facilitator:${sessionRef}`) || "";
    const token = tokenFromQuery || tokenFromStorage;
    if (token) {
      setFacilitatorToken(token);
      localStorage.setItem(`ceo-clinic:facilitator:${sessionRef}`, token);
    }
  }, [searchParams, sessionRef]);

  function facilitatorHeaders(): HeadersInit {
    if (!facilitatorToken.trim()) {
      return {};
    }

    return {
      "x-facilitator-token": facilitatorToken.trim()
    };
  }

  const applyLoadedData = useCallback((sessionState: SessionState, sessionResults: SessionResults) => {
    setState(sessionState);
    setResults(sessionResults);
    setError(null);
  }, []);

  const fetchSessionData = useCallback(async () => {
    const [sessionState, sessionResults] = await Promise.all([
      fetchApi<SessionState>(`/api/sessions/${sessionRef}/state`),
      fetchApi<SessionResults>(`/api/sessions/${sessionRef}/results`)
    ]);

    return { sessionState, sessionResults };
  }, [sessionRef]);

  const load = useCallback(async () => {
    try {
      const { sessionState, sessionResults } = await fetchSessionData();
      applyLoadedData(sessionState, sessionResults);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to fetch session state");
    } finally {
      setLoading(false);
    }
  }, [applyLoadedData, fetchSessionData]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state?.session.status === "completed") {
      setStatusMessage(null);
    }
  }, [state?.session.status]);

  const refreshUntilVisible = useCallback(
    async (matcher: (sessionState: SessionState) => boolean): Promise<boolean> => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { sessionState, sessionResults } = await fetchSessionData();
        applyLoadedData(sessionState, sessionResults);

        if (matcher(sessionState)) {
          return true;
        }

        if (attempt < 5) {
          await sleep(350);
        }
      }

      return false;
    },
    [applyLoadedData, fetchSessionData]
  );

  const realtimeTables = useMemo(
    () => [
      "sessions",
      "players",
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
    channelKey: "facilitator-live",
    tables: realtimeTables,
    onChange: load
  });

  const refreshMessageFeed = useCallback(async () => {
    const trimmedToken = facilitatorToken.trim();
    if (!trimmedToken) {
      setMessageFeed(null);
      return;
    }

    setMessageLoading(true);
    try {
      const params = new URLSearchParams({
        direction: "all",
        limit: "500"
      });
      const feed = await fetchApi<MessageCenterFeed>(
        `/api/sessions/${sessionRef}/messages?${params.toString()}`,
        {
          headers: {
            "x-facilitator-token": trimmedToken
          }
        }
      );
      setMessageFeed(feed);
    } catch (feedError) {
      setError(feedError instanceof Error ? feedError.message : "Unable to load message center");
    } finally {
      setMessageLoading(false);
    }
  }, [facilitatorToken, sessionRef]);

  useEffect(() => {
    void refreshMessageFeed();
  }, [refreshMessageFeed, state]);

  const allMessages = messageFeed?.messages || [];
  const pendingMessages = allMessages.filter((message) => message.status === "pending");
  const acceptedMessages = allMessages.filter((message) => message.status === "accepted");
  const rejectedMessages = allMessages.filter(
    (message) => message.status === "rejected" || message.status === "expired" || message.status === "countered"
  );

  const runFacilitatorMutation = useCallback(
    async ({
      action,
      request,
      matcher,
      progressMessage,
      successMessage
    }: {
      action: FacilitatorMutationAction;
      request: () => Promise<unknown>;
      matcher: (sessionState: SessionState) => boolean;
      progressMessage: string;
      successMessage: string;
    }): Promise<void> => {
      setError(null);
      setPendingAction(action);
      setStatusMessage(progressMessage);

      try {
        await request();
        const confirmed = await refreshUntilVisible(matcher);
        setStatusMessage(
          confirmed ? successMessage : `${formatActionLabel(action)} submitted. Waiting for visible board sync.`
        );
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : "Unable to update facilitator state");
        setStatusMessage(null);
      } finally {
        setPendingAction(null);
      }
    },
    [refreshUntilVisible]
  );

  async function control(action: FacilitatorControlAction): Promise<void> {
    await runFacilitatorMutation({
      action,
      request: () =>
        fetchApi<{ session: SessionState["session"] }>(`/api/facilitator/${sessionRef}/control`, {
          method: "POST",
          headers: facilitatorHeaders(),
          body: JSON.stringify({ action })
        }),
      matcher: (nextState) => {
        switch (action) {
          case "start":
            return nextState.session.status === "running" && nextState.current_round?.phase === "decision";
          case "pause":
            return nextState.session.status === "paused";
          case "resume":
            return nextState.session.status === "running";
          case "advance_to_interaction":
            return nextState.current_round?.phase === "interaction";
          default:
            return false;
        }
      },
      progressMessage: `${formatActionLabel(action)}...`,
      successMessage: `${formatActionLabel(action)} confirmed on the board.`
    });
  }

  async function resolveRound(): Promise<void> {
    if (!state) {
      return;
    }

    const currentRoundId = state.current_round?.id;
    const currentRoundNumber = state.session.current_round_number;

    await runFacilitatorMutation({
      action: "resolve_round",
      request: () =>
        fetchApi<{ resolution: unknown }>(`/api/facilitator/${sessionRef}/round/resolve`, {
          method: "POST",
          headers: facilitatorHeaders()
        }),
      matcher: (nextState) =>
        nextState.session.status === "completed" ||
        nextState.current_round?.id !== currentRoundId ||
        (nextState.session.current_round_number === currentRoundNumber + 1 &&
          nextState.current_round?.phase === "decision"),
      progressMessage: "Resolving round...",
      successMessage: "Round resolve confirmed on the board."
    });
  }

  function applyPreset(preset: EventPreset) {
    setSelectedPresetId(preset.id);
    setEventCategory(preset.category);
    setEventSeverity(preset.severity);
    setEventTitle(preset.title);
    setEventNarrative(preset.narrative);
    setEventEffects({
      cash: String(preset.effects.cash),
      revenue_growth: String(preset.effects.revenue_growth),
      market_share: String(preset.effects.market_share),
      talent_morale: String(preset.effects.talent_morale),
      operational_resilience: String(preset.effects.operational_resilience),
      brand_reputation: String(preset.effects.brand_reputation),
      regulatory_risk: String(preset.effects.regulatory_risk),
    });
  }

  async function injectEvent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!state?.current_round) {
      setError("No active round is available for event injection.");
      return;
    }

    const parsedEffects = Object.fromEntries(
      Object.entries(eventEffects)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => !Number.isNaN(value) && value !== 0)
    );

    if (Object.keys(parsedEffects).length === 0) {
      setError("Add at least one non-zero event effect.");
      return;
    }

    const requestedTitle = eventTitle.trim();
    const requestedNarrative = eventNarrative.trim();
    const requestedRoundId = state.current_round.id;

    await runFacilitatorMutation({
      action: "inject_event",
      request: async () => {
        await fetchApi(`/api/facilitator/${sessionRef}/event`, {
          method: "POST",
          headers: facilitatorHeaders(),
          body: JSON.stringify({
            category: eventCategory,
            severity: eventSeverity,
            title: requestedTitle,
            narrative: requestedNarrative,
            effects: parsedEffects
          })
        });
        setEventEffects(emptyEffects);
      },
      matcher: (nextState) =>
        nextState.current_event?.round_id === requestedRoundId &&
        nextState.current_event?.event.title === requestedTitle &&
        nextState.current_event?.event.narrative === requestedNarrative,
      progressMessage: "Injecting facilitator event...",
      successMessage: "Facilitator event confirmed in the breaking news feed."
    });
  }

  if (loading && !state) {
    return (
      <main className="page">
        <p>Loading facilitator view...</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="page">
        <p className="error">{error || "Session not found"}</p>
      </main>
    );
  }

  const session = state.session;
  const currentRound = state.current_round;
  const isCompleted = session.status === "completed";
  const leaderboard = results?.leaderboard || [];
  const leadDelta = leaderboard.length > 1 ? leaderboard[0].total_score - leaderboard[1].total_score : 0;
  const companyNameById = new Map(state.companies.map((company) => [company.id, company.name]));
  const winningEntry = leaderboard[0] ?? null;
  const winningCompanyName = winningEntry ? companyNameById.get(winningEntry.company_id) ?? winningEntry.company_id : null;
  const interactionCounts = allMessages.reduce(
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
  const timeline = results?.decision_timeline || [];
  const controlLocked = !facilitatorToken.trim() || pendingAction !== null;
  const canStart = session.status === "waiting" && state.players.length > 0 && !controlLocked;
  const canPause = session.status === "running" && !controlLocked;
  const canResume = session.status === "paused" && !controlLocked;
  const canOpenInteraction =
    (session.status === "running" || session.status === "paused") &&
    currentRound?.phase === "decision" &&
    !controlLocked;
  const canResolve =
    (session.status === "running" || session.status === "paused") &&
    currentRound?.phase !== "resolved" &&
    currentRound !== null &&
    !controlLocked;
  const canInjectEvent =
    (session.status === "running" || session.status === "paused") &&
    currentRound?.phase !== "resolved" &&
    !controlLocked;
  const snapshotItems = isCompleted
    ? [
        {
          label: "Winner",
          value: winningCompanyName || "N/A",
          tone: "good" as const
        },
        {
          label: "Closest Finish",
          value: leaderboard.length > 1 ? leadDelta.toFixed(2) : "N/A",
          tone: leadDelta > 0 ? ("warn" as const) : ("muted" as const)
        },
        {
          label: "Accepted Deals",
          value: String(interactionCounts.accepted),
          tone: interactionCounts.accepted > 0 ? ("good" as const) : ("muted" as const)
        },
        {
          label: "Expired Deals",
          value: String(interactionCounts.expired),
          tone: interactionCounts.expired > 0 ? ("warn" as const) : ("default" as const)
        }
      ]
    : [
        {
          label: "Decisions",
          value: `${state.decisions_submitted}/${state.players.length || 1}`,
          tone: "default" as const
        },
        {
          label: "Round Phase",
          value: formatPhase(currentRound?.phase),
          tone: "default" as const
        },
        {
          label: "Control State",
          value: pendingAction ? formatActionLabel(pendingAction) : facilitatorToken.trim() ? "Ready" : "Token required",
          tone: pendingAction ? ("warn" as const) : facilitatorToken.trim() ? ("good" as const) : ("muted" as const)
        },
        {
          label: "Top Rank Delta",
          value: leaderboard.length > 1 ? leadDelta.toFixed(2) : "N/A",
          tone: leadDelta > 0 ? ("good" as const) : ("muted" as const)
        }
      ];
  const roundPhase = currentRound?.phase ?? "pending";
  const sessionStatus = state?.session.status ?? "waiting";
  const mainClassName = [
    "page",
    "dashboard-shell",
    "dashboard-context",
    "facilitator-view",
    `phase-${roundPhase}`,
    `session-${session.status}`,
    isCompleted ? "mode-complete" : "mode-live"
  ].join(" ");

  return (
    <main className={mainClassName}>
      <section className="hero hero-dashboard">
        <div className="hero-main">
          <h1>
            <span className="callsign">Command</span> Center
          </h1>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", letterSpacing: "0.08em", color: "var(--muted)" }}>
            SESSION <b style={{ color: "var(--accent)" }}>{session.code}</b>
            &nbsp;|&nbsp;
            ROUND <b style={{ color: "var(--ink)" }}>{session.current_round_number}</b> OF {session.total_rounds}
            &nbsp;|&nbsp;
            <Users size={11} style={{ display: "inline", verticalAlign: "middle" }} />
            &nbsp;<b style={{ color: "var(--ink)" }}>{state.players.length}</b> UNITS
          </p>
          <p className="small hero-note">
            {isCompleted
              ? "Simulation complete. Debrief the ranking swings, negotiation outcomes, and round timeline."
              : pendingAction
                ? `${formatActionLabel(pendingAction)} is in progress. Awaiting state confirmation.`
                : "Monitor all companies, phase controls, and message traffic."}
          </p>

          {/* Round progress segments */}
          <div className="round-progress">
            <span className="round-progress-label">Mission</span>
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
            <span className={`badge status-${session.status}`}>
              <Activity size={9} />
              {session.status.toUpperCase()}
            </span>
            <span className="badge">
              <Zap size={9} />
              {formatPhase(state.current_round?.phase)}
            </span>
            <span className="badge" style={
              realtime.status === "live"
                ? { color: "var(--good)", borderColor: "rgba(0,230,118,0.3)", background: "var(--good-soft)" }
                : {}
            }>
              {realtime.status === "live" ? "◉ LIVE" : realtime.status === "connecting" ? "SYNC" : "OFFLINE"}
            </span>
          </div>
          <button className="mail-button" onClick={() => setDrawerOpen(true)}>
            <MessageSquare size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
            Intel Center {pendingMessages.length > 0 ? `(${pendingMessages.length})` : ""}
          </button>
        </div>
      </section>

      <PhaseBanner
        phase={roundPhase}
        sessionStatus={sessionStatus}
        role="facilitator"
        decisionsSubmitted={state?.decisions_submitted}
        totalPlayers={state.players.length}
      />

      <section className="priority-grid">
        <RoundSnapshotCard
          title={isCompleted ? "Session Debrief" : "Mission Status"}
          subtitle={isCompleted ? `Completed session for ${state.players.length} companies` : `Round ${session.current_round_number}`}
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
                ? "Use this panel as the discussion opener before walking through the detailed timeline."
                : "Controls stay server authoritative and now wait for the visible board state before confirming success."}
            </p>
          }
        />

        <BreakingNewsPanel
          event={state.current_event}
          roundNumber={state.current_round?.round_number ?? session.current_round_number}
          title={isCompleted ? "Final Round Trigger" : "Threat Alert"}
        />
      </section>

      <section className="hierarchy-grid two-col">
        <article className="card">
          <div className="card-head">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Trophy size={14} color="var(--accent)" />
              <h3>Combat Rankings</h3>
            </div>
            <p className="small">Live ranking by total score.</p>
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
              {leaderboard.map((entry) => {
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
          leaderboard={leaderboard}
        />
      </section>

      {isCompleted ? (
        <>
          <section className="hierarchy-grid two-col action-grid">
            <article className="card card-prominent debrief-summary">
              <div className="card-head">
                <h3>Facilitator Debrief</h3>
                <p className="small">A concise readout for the live discussion at the end of the session.</p>
              </div>
              <p className="debrief-headline">{winningCompanyName ? `${winningCompanyName} finished first.` : "Final winner unavailable."}</p>
              <p className="small">
                {leaderboard.length > 1
                  ? `The top two companies were separated by ${leadDelta.toFixed(2)} points, so small late-round moves still mattered.`
                  : "Only one ranked company is available in the final leaderboard."}
              </p>
              <div className="summary-strip">
                <div className="summary-item">
                  <span className="small">Companies</span>
                  <b>{state.players.length}</b>
                </div>
                <div className="summary-item">
                  <span className="small">Rounds logged</span>
                  <b>{timeline.length}</b>
                </div>
                <div className="summary-item">
                  <span className="small">Accepted</span>
                  <b>{interactionCounts.accepted}</b>
                </div>
                <div className="summary-item">
                  <span className="small">Expired</span>
                  <b>{interactionCounts.expired}</b>
                </div>
              </div>
            </article>

            <article className="card">
              <div className="card-head">
                <h3>Wrap-Up Tools</h3>
                <p className="small">Keep the end-state readable instead of leaving the live controls on screen.</p>
              </div>

              <div className="metrics-grid compact">
                <div className="metric">
                  <span className="small">Accepted deals</span>
                  <b>{interactionCounts.accepted}</b>
                </div>
                <div className="metric">
                  <span className="small">Rejected deals</span>
                  <b>{interactionCounts.rejected}</b>
                </div>
                <div className="metric">
                  <span className="small">Countered</span>
                  <b>{interactionCounts.countered}</b>
                </div>
                <div className="metric">
                  <span className="small">Expired</span>
                  <b>{interactionCounts.expired}</b>
                </div>
              </div>

              {!facilitatorToken.trim() ? (
                <label>
                  Facilitator token
                  <input
                    value={facilitatorToken}
                    onChange={(event) => {
                      const next = event.target.value;
                      setFacilitatorToken(next);
                      localStorage.setItem(`ceo-clinic:facilitator:${sessionRef}`, next);
                    }}
                    placeholder="Paste facilitator token"
                  />
                </label>
              ) : null}

              <button onClick={() => setDrawerOpen(true)}>Open Message Center</button>
            </article>
          </section>

          <section className="card timeline-card">
            <div className="card-head split">
              <div>
                <h3>Round Debrief Timeline</h3>
                <p className="small">Walk through how each event shifted decisions, negotiations, and the lead company.</p>
              </div>
              <span className="badge">Rounds: {timeline.length}</span>
            </div>

            <div className="timeline-list">
              {timeline.map((entry) => {
                const roundLeader = entry.leaderboard[0];
                const interactionSummary = entry.interactions.reduce(
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
                    <div className="timeline-stats">
                      <span>Decisions {entry.decisions.length}</span>
                      <span>Interactions {entry.interactions.length}</span>
                      <span>Accepted {interactionSummary.accepted || 0}</span>
                      <span>Expired {interactionSummary.expired || 0}</span>
                    </div>
                    <p className="small">
                      Leader after resolve:{" "}
                      <b>
                        {roundLeader
                          ? companyNameById.get(roundLeader.company_id) ?? roundLeader.company_id
                          : "Unavailable"}
                      </b>
                      {roundLeader ? ` (${roundLeader.total_score.toFixed(2)})` : ""}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="hierarchy-grid two-col action-grid">
          <article className="card">
            <div className="card-head">
              <h3>Session Controls</h3>
              <p className="small">The board only confirms success after the visible phase or status matches the requested action.</p>
            </div>

            <label>
              Facilitator token
              <input
                value={facilitatorToken}
                onChange={(event) => {
                  const next = event.target.value;
                  setFacilitatorToken(next);
                  localStorage.setItem(`ceo-clinic:facilitator:${sessionRef}`, next);
                }}
                placeholder="Paste facilitator token"
              />
            </label>

            <div className="metrics-grid compact operations-readout">
              <div className="metric">
                <span className="small">Control gate</span>
                <b>{facilitatorToken.trim() ? "Unlocked" : "Token required"}</b>
              </div>
              <div className="metric">
                <span className="small">Action state</span>
                <b>{pendingAction ? formatActionLabel(pendingAction) : "Ready"}</b>
              </div>
              <div className="metric">
                <span className="small">Visible phase</span>
                <b>{formatPhase(currentRound?.phase)}</b>
              </div>
              <div className="metric">
                <span className="small">Decisions in</span>
                <b>
                  {state.decisions_submitted}/{state.players.length || 1}
                </b>
              </div>
            </div>

            <div className="inline">
              <button disabled={!canStart} onClick={() => void control("start")}>
                {pendingAction === "start" ? "Starting..." : "Start"}
              </button>
              <button className="secondary" disabled={!canPause} onClick={() => void control("pause")}>
                {pendingAction === "pause" ? "Pausing..." : "Pause"}
              </button>
              <button className="secondary" disabled={!canResume} onClick={() => void control("resume")}>
                {pendingAction === "resume" ? "Resuming..." : "Resume"}
              </button>
              <button
                className="secondary"
                disabled={!canOpenInteraction}
                onClick={() => void control("advance_to_interaction")}
              >
                {pendingAction === "advance_to_interaction" ? "Opening..." : "Open Interaction"}
              </button>
              <button className="warn" disabled={!canResolve} onClick={() => void resolveRound()}>
                {pendingAction === "resolve_round" ? "Resolving..." : "Resolve Round"}
              </button>
            </div>

            {!facilitatorToken.trim() ? (
              <p className="small">Locked: facilitator token is required for control, event, and resolve routes.</p>
            ) : null}
          </article>

          <article className="card">
            <div className="card-head">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Zap size={14} color="var(--warn)" />
                <h3>Deploy Event</h3>
              </div>
              <p className="small">Allowed once per session. The success state waits for the threat-alert panel to update.</p>
            </div>

            <form onSubmit={injectEvent}>
              {/* Preset Library */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
                  {(["all", "economic", "social", "political"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPresetCategoryFilter(cat)}
                      style={{
                        background: presetCategoryFilter === cat ? "rgba(255,215,0,0.15)" : "rgba(107,122,148,0.08)",
                        color: presetCategoryFilter === cat ? "var(--accent)" : "var(--muted)",
                        border: presetCategoryFilter === cat ? "1px solid rgba(255,215,0,0.3)" : "1px solid rgba(107,122,148,0.2)",
                        borderRadius: "4px",
                        padding: "0.15rem 0.6rem",
                        fontSize: "0.65rem",
                        letterSpacing: "0.1em",
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                  {EVENT_PRESETS
                    .filter((p) => presetCategoryFilter === "all" || p.category === presetCategoryFilter)
                    .map((preset) => {
                      const isSelected = selectedPresetId === preset.id;
                      const severityColor = preset.severity === "high"
                        ? { bg: "rgba(255,107,53,0.08)", border: isSelected ? "rgba(255,107,53,0.7)" : "rgba(255,107,53,0.3)", label: "#ff6b35" }
                        : preset.severity === "medium"
                        ? { bg: "rgba(255,215,0,0.04)", border: isSelected ? "rgba(255,215,0,0.6)" : "rgba(255,215,0,0.18)", label: "#ffd700" }
                        : { bg: "rgba(0,212,255,0.04)", border: isSelected ? "rgba(0,212,255,0.6)" : "rgba(0,212,255,0.15)", label: "#00d4ff" };

                      const keyEffects = Object.entries(preset.effects)
                        .filter(([, v]) => v !== 0)
                        .slice(0, 2)
                        .map(([k, v]) => `${k.replace(/_/g, " ")} ${v > 0 ? "+" : ""}${v}`)
                        .join("  ");

                      return (
                        <div
                          key={preset.id}
                          onClick={() => applyPreset(preset)}
                          style={{
                            background: severityColor.bg,
                            border: `1px solid ${severityColor.border}`,
                            borderRadius: "8px",
                            padding: "0.6rem",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ color: severityColor.label, fontSize: "0.62rem", letterSpacing: "0.1em", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                            {preset.category} · {preset.severity}
                          </div>
                          <div style={{ color: "var(--ink)", fontSize: "0.78rem", fontWeight: "700", margin: "0.2rem 0" }}>
                            {preset.label}
                          </div>
                          <div style={{ color: "var(--muted)", fontSize: "0.65rem" }}>{keyEffects}</div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "0.8rem", marginBottom: "0.6rem", textAlign: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: "0.65rem", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
                  — CUSTOMIZE OR DEPLOY AS-IS —
                </span>
              </div>

              <fieldset className="form-fieldset" disabled={!canInjectEvent}>
                <label>
                  Category
                  <select value={eventCategory} onChange={(event) => setEventCategory(event.target.value as typeof eventCategory)}>
                    <option value="economic">Economic</option>
                    <option value="social">Social</option>
                    <option value="political">Political</option>
                  </select>
                </label>

                <label>
                  Severity
                  <select value={eventSeverity} onChange={(event) => setEventSeverity(event.target.value as typeof eventSeverity)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label>
                  Title
                  <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} required />
                </label>

                <label>
                  Narrative
                  <textarea value={eventNarrative} onChange={(event) => setEventNarrative(event.target.value)} rows={3} required />
                </label>

                <div className="metrics-grid compact">
                  {(Object.entries(eventEffects) as Array<[keyof EventEffectInputs, string]>).map(([key, value]) => {
                    const bounds = effectBounds[key];
                    return (
                      <label key={key}>
                        {key} ({bounds.min} to {bounds.max})
                        <input
                          type="number"
                          min={bounds.min}
                          max={bounds.max}
                          step={1}
                          value={value}
                          onChange={(event) =>
                            setEventEffects((prev) => ({
                              ...prev,
                              [key]: event.target.value
                            }))
                          }
                          placeholder="0"
                        />
                      </label>
                    );
                  })}
                </div>

                <button type="submit" className="warn">
                  <Zap size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
                  {pendingAction === "inject_event" ? "Deploying..." : "Deploy Event"}
                </button>
              </fieldset>
              {!facilitatorToken.trim() ? <p className="small">Locked: facilitator token required.</p> : null}
            </form>
          </article>
        </section>
      )}

      {statusMessage ? <p className="notice">{statusMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <MessageCenterDrawer
        open={drawerOpen}
        title="Session Message Center"
        subtitle={facilitatorToken.trim() ? "Monitor-only feed" : "Add facilitator token to unlock"}
        activeTabId={drawerTab}
        onTabChange={(tabId) => setDrawerTab(tabId as typeof drawerTab)}
        onClose={() => setDrawerOpen(false)}
        tabs={[
          {
            id: "all",
            label: "All",
            count: allMessages.length,
            content: (
              <div className="message-list">
                {!facilitatorToken.trim() ? <p className="small">Add facilitator token to load session feed.</p> : null}
                {messageLoading ? <p className="small">Loading messages...</p> : null}
                {allMessages.length === 0 && facilitatorToken.trim() ? <p className="small">No messages yet.</p> : null}
                {allMessages.map((message) => (
                  <article className="message-item" key={message.proposal_id}>
                    <div className="message-head">
                      <p>
                        <b>{message.proposer_company_name}</b> to <b>{message.target_company_name}</b>
                      </p>
                      <span className={`badge status-${message.status}`}>{message.status.toUpperCase()}</span>
                    </div>
                    <p className="small">Round {message.round_number ?? "?"}</p>
                    <p className="small">Type: {message.type.replace("_", " ")}</p>
                    <p className="small">Intensity: {message.terms.intensity}</p>
                    {message.terms.message ? <p className="small">&quot;{message.terms.message}&quot;</p> : null}
                    <p className="small">Expires {formatDateTime(message.expires_at)}</p>
                    <p className="small">Updated {formatDateTime(message.updated_at)}</p>
                  </article>
                ))}
              </div>
            )
          },
          {
            id: "pending",
            label: "Pending",
            count: pendingMessages.length,
            content: (
              <div className="message-list">
                {pendingMessages.length === 0 ? <p className="small">No pending proposals.</p> : null}
                {pendingMessages.map((message) => (
                  <article className="message-item" key={message.proposal_id}>
                    <p>
                      <b>{message.proposer_company_name}</b> to <b>{message.target_company_name}</b>
                    </p>
                    <p className="small">Round {message.round_number ?? "?"}</p>
                    <p className="small">Type: {message.type.replace("_", " ")}</p>
                    <p className="small">Expires {formatDateTime(message.expires_at)}</p>
                    <p className="small">Updated {formatDateTime(message.updated_at)}</p>
                  </article>
                ))}
              </div>
            )
          },
          {
            id: "accepted",
            label: "Accepted",
            count: acceptedMessages.length,
            content: (
              <div className="message-list">
                {acceptedMessages.length === 0 ? <p className="small">No accepted proposals.</p> : null}
                {acceptedMessages.map((message) => (
                  <article className="message-item" key={message.proposal_id}>
                    <p>
                      <b>{message.proposer_company_name}</b> to <b>{message.target_company_name}</b>
                    </p>
                    <p className="small">Round {message.round_number ?? "?"}</p>
                    <p className="small">Expires {formatDateTime(message.expires_at)}</p>
                    <p className="small">Updated {formatDateTime(message.updated_at)}</p>
                  </article>
                ))}
              </div>
            )
          },
          {
            id: "rejected",
            label: "Rejected/Expired",
            count: rejectedMessages.length,
            content: (
              <div className="message-list">
                {rejectedMessages.length === 0 ? <p className="small">No rejected/expired proposals.</p> : null}
                {rejectedMessages.map((message) => (
                  <article className="message-item" key={message.proposal_id}>
                    <div className="message-head">
                      <p>
                        <b>{message.proposer_company_name}</b> to <b>{message.target_company_name}</b>
                      </p>
                      <span className={`badge status-${message.status}`}>{message.status.toUpperCase()}</span>
                    </div>
                    <p className="small">Round {message.round_number ?? "?"}</p>
                    <p className="small">Expires {formatDateTime(message.expires_at)}</p>
                    <p className="small">Updated {formatDateTime(message.updated_at)}</p>
                  </article>
                ))}
              </div>
            )
          }
        ]}
      />
    </main>
  );
}
