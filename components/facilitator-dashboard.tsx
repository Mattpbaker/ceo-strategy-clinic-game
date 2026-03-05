"use client";

import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import { SessionResults, SessionState } from "@/lib/types";
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

export function FacilitatorDashboard({ sessionRef }: FacilitatorDashboardProps): React.ReactElement {
  const searchParams = useSearchParams();
  const [state, setState] = useState<SessionState | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [facilitatorToken, setFacilitatorToken] = useState("");

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
      const sessionState = await fetchApi<SessionState>(`/api/sessions/${sessionRef}/state`);
      setState(sessionState);
      const sessionResults = await fetchApi<SessionResults>(`/api/sessions/${sessionRef}/results`);
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
      "score_snapshots"
    ],
    []
  );

  const realtime = useSessionRealtime({
    sessionId: state?.session.id,
    channelKey: "facilitator-live",
    tables: realtimeTables,
    onChange: load
  });

  const leaderboard = useMemo(() => {
    if (!results) {
      return [];
    }
    return results.leaderboard;
  }, [results]);

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
  const currentRound = state.current_round;

  return (
    <main className="page">
      <section className="hero">
        <h1>Facilitator Console</h1>
        <p>
          Session <b>{session.code}</b> | Round {session.current_round_number} of {session.total_rounds}
        </p>
        <div className="inline">
          <span className={`badge status-${session.status}`}>{session.status.toUpperCase()}</span>
          <span className="badge">Players: {state.players.length}</span>
          <span className="badge">
            Realtime:{" "}
            {realtime.status === "live"
              ? "Live"
              : realtime.status === "connecting"
                ? "Connecting"
                : realtime.backoffMs
                  ? `Offline (retrying in ${Math.ceil(realtime.backoffMs / 1000)}s)`
                  : "Offline"}
          </span>
          {currentRound ? <span className="badge">Phase: {currentRound.phase}</span> : null}
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Session Controls</h2>
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
          <p className="small">Required for facilitator-only actions.</p>
          <div className="inline">
            <button onClick={() => void control("start")}>Start</button>
            <button className="secondary" onClick={() => void control("pause")}>Pause</button>
            <button className="secondary" onClick={() => void control("resume")}>Resume</button>
            <button className="secondary" onClick={() => void control("advance_to_interaction")}>Open Interaction Phase</button>
            <button className="warn" onClick={() => void resolveRound()}>Force Resolve Round</button>
          </div>
          <p className="small">
            Decisions submitted: {state.decisions_submitted} / {state.players.length || 1}
          </p>
        </article>

        <article className="card">
          <h2>Inject One Ad-hoc Event</h2>
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

            <div className="metrics-grid">
              {(Object.entries(eventEffects) as Array<[keyof EventEffectInputs, string]>).map(
                ([key, value]) => {
                  const bounds = effectBounds[key];

                  return (
                    <label key={key}>
                      {key} ({bounds.min} to {bounds.max})
                      <input
                        type="number"
                        value={value}
                        min={bounds.min}
                        max={bounds.max}
                        step={1}
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
                }
              )}
            </div>

            <button type="submit">Inject Event</button>
          </form>
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <h3>Current Event</h3>
          {state.current_event ? (
            <>
              <p>
                <b>{state.current_event.event.title}</b> ({state.current_event.event.category} /
                {" "}
                {state.current_event.event.severity})
              </p>
              <p className="small">{state.current_event.event.narrative}</p>
            </>
          ) : (
            <p className="small">No event revealed yet for this round.</p>
          )}
        </article>

        <article className="card">
          <h3>Leaderboard</h3>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Company</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry) => {
                const company = state.companies.find((item) => item.id === entry.company_id);
                return (
                  <tr key={entry.company_id}>
                    <td>#{entry.rank}</td>
                    <td>{company?.name || entry.company_id}</td>
                    <td>{entry.total_score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      </section>

      <section className="card">
        <h3>Company Metrics</h3>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Cash</th>
              <th>Rev. Growth</th>
              <th>Share</th>
              <th>Morale</th>
              <th>Resilience</th>
              <th>Reputation</th>
              <th>Reg Risk</th>
            </tr>
          </thead>
          <tbody>
            {state.companies.map((company) => (
              <tr key={company.id}>
                <td>{company.name}</td>
                <td>{company.metrics.cash.toFixed(1)}</td>
                <td>{company.metrics.revenue_growth.toFixed(1)}</td>
                <td>{company.metrics.market_share.toFixed(1)}</td>
                <td>{company.metrics.talent_morale.toFixed(1)}</td>
                <td>{company.metrics.operational_resilience.toFixed(1)}</td>
                <td>{company.metrics.brand_reputation.toFixed(1)}</td>
                <td>{company.metrics.regulatory_risk.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {statusMessage ? <p className="notice">{statusMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
