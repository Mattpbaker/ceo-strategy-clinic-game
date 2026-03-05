"use client";

import { LeaderboardComparisonChart } from "@/components/charts/leaderboard-comparison-chart";
import { BreakingNewsPanel } from "@/components/ui/breaking-news-panel";
import { MessageCenterDrawer } from "@/components/ui/message-center-drawer";
import { RoundSnapshotCard } from "@/components/ui/round-snapshot-card";
import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import { MessageCenterFeed, SessionResults, SessionState } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface FacilitatorDashboardProps {
  sessionRef: string;
}

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

export function FacilitatorDashboard({ sessionRef }: FacilitatorDashboardProps): React.ReactElement {
  const searchParams = useSearchParams();

  const [state, setState] = useState<SessionState | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [facilitatorToken, setFacilitatorToken] = useState("");

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
      setError(loadError instanceof Error ? loadError.message : "Unable to fetch session state");
    } finally {
      setLoading(false);
    }
  }, [sessionRef]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function control(action: "start" | "pause" | "resume" | "advance_to_interaction"): Promise<void> {
    try {
      await fetchApi<{ session: SessionState["session"] }>(`/api/facilitator/${sessionRef}/control`, {
        method: "POST",
        headers: facilitatorHeaders(),
        body: JSON.stringify({ action })
      });
      setStatusMessage(`Action ${action} completed.`);
      await load();
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : "Unable to update session state");
    }
  }

  async function resolveRound(): Promise<void> {
    try {
      await fetchApi<{ resolution: unknown }>(`/api/facilitator/${sessionRef}/round/resolve`, {
        method: "POST",
        headers: facilitatorHeaders()
      });
      setStatusMessage("Round resolved.");
      await load();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Unable to resolve round");
    }
  }

  async function injectEvent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedEffects = Object.fromEntries(
      Object.entries(eventEffects)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => !Number.isNaN(value) && value !== 0)
    );

    if (Object.keys(parsedEffects).length === 0) {
      setError("Add at least one non-zero event effect.");
      return;
    }

    try {
      await fetchApi(`/api/facilitator/${sessionRef}/event`, {
        method: "POST",
        headers: facilitatorHeaders(),
        body: JSON.stringify({
          category: eventCategory,
          severity: eventSeverity,
          title: eventTitle,
          narrative: eventNarrative,
          effects: parsedEffects
        })
      });

      setStatusMessage("Facilitator event injected for this round.");
      setEventEffects(emptyEffects);
      await load();
    } catch (injectError) {
      setError(injectError instanceof Error ? injectError.message : "Unable to inject event");
    }
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
  const leaderboard = results?.leaderboard || [];
  const leadDelta = leaderboard.length > 1 ? leaderboard[0].total_score - leaderboard[1].total_score : 0;

  const snapshotItems = [
    {
      label: "Decisions",
      value: `${state.decisions_submitted}/${state.players.length || 1}`,
      tone: "default"
    },
    {
      label: "Round Phase",
      value: formatPhase(state.current_round?.phase),
      tone: "default"
    },
    {
      label: "Active Companies",
      value: String(state.companies.length),
      tone: "default"
    },
    {
      label: "Top Rank Delta",
      value: leaderboard.length > 1 ? leadDelta.toFixed(2) : "N/A",
      tone: leadDelta > 0 ? "good" : "muted"
    }
  ] as const;

  return (
    <main className="page dashboard-shell">
      <section className="hero hero-dashboard">
        <div className="hero-main">
          <h1>Facilitator Console</h1>
          <p>
            Session <b>{session.code}</b> | Round {session.current_round_number} of {session.total_rounds}
          </p>
          <p className="small hero-note">Monitor all companies, phase controls, and message traffic.</p>
        </div>

        <div className="hero-tools">
          <div className="inline">
            <span className={`badge status-${session.status}`}>{session.status.toUpperCase()}</span>
            <span className="badge">Players: {state.players.length}</span>
            <span className="badge">Phase: {formatPhase(state.current_round?.phase)}</span>
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
            {"\u2709"} Message Center {pendingMessages.length > 0 ? `(${pendingMessages.length})` : ""}
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
          footer={<p className="small">Current controls remain server authoritative.</p>}
        />

        <BreakingNewsPanel
          event={state.current_event}
          roundNumber={state.current_round?.round_number ?? session.current_round_number}
        />
      </section>

      <section className="hierarchy-grid two-col">
        <article className="card">
          <div className="card-head">
            <h3>Leaderboard</h3>
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

      <section className="hierarchy-grid two-col action-grid">
        <article className="card">
          <div className="card-head">
            <h3>Session Controls</h3>
            <p className="small">Facilitator token is required for control, event, and resolve routes.</p>
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

          <div className="inline">
            <button onClick={() => void control("start")}>Start</button>
            <button className="secondary" onClick={() => void control("pause")}>
              Pause
            </button>
            <button className="secondary" onClick={() => void control("resume")}>
              Resume
            </button>
            <button className="secondary" onClick={() => void control("advance_to_interaction")}>
              Open Interaction
            </button>
            <button className="warn" onClick={() => void resolveRound()}>
              Resolve Round
            </button>
          </div>

          <p className="small">
            Decisions submitted: {state.decisions_submitted} / {state.players.length || 1}
          </p>
        </article>

        <article className="card">
          <div className="card-head">
            <h3>Inject One Ad-hoc Event</h3>
            <p className="small">Allowed once per session.</p>
          </div>

          <form onSubmit={injectEvent}>
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

            <button type="submit">Inject Event</button>
          </form>
        </article>
      </section>

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
