"use client";

import { Monitor } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { scoreCompanies } from "@/lib/scoring";
import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import type {
  SessionState,
  EventCategory,
  EventSeverity,
  MetricKey
} from "@/lib/types";

interface WarRoomDisplayProps {
  sessionCode: string;
}

interface FeedEvent {
  key: string;
  roundNumber: number;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  narrative: string;
  effects: Partial<Record<MetricKey, number>> | null;
}

const METRIC_LABELS: Record<MetricKey, string> = {
  cash: "CASH",
  revenue_growth: "GROWTH",
  market_share: "MARKET",
  talent_morale: "MORALE",
  operational_resilience: "RESILIENCE",
  brand_reputation: "BRAND",
  regulatory_risk: "REG RISK"
};

const RANK_COLORS = ["#ffd700", "#c0c0c0", "#cd7f32"];

export function WarRoomDisplay({ sessionCode }: WarRoomDisplayProps): React.ReactElement {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchApi<SessionState>(`/api/sessions/${sessionCode}/state`);
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load session");
    }
  }, [sessionCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const { status: realtimeStatus } = useSessionRealtime({
    sessionId: state?.session.id ?? null,
    channelKey: `display:${sessionCode}`,
    tables: ["sessions", "companies", "rounds", "round_events"],
    onChange: load
  });

  const scores = useMemo(() => {
    if (!state || state.companies.length === 0) return [];
    return scoreCompanies(state.companies);
  }, [state]);

  const companyNameById = useMemo(() => {
    if (!state) return new Map<string, string>();
    return new Map(state.companies.map((c) => [c.id, c.name]));
  }, [state]);

  const playerNicknameByCompanyId = useMemo(() => {
    if (!state) return new Map<string, string>();
    return new Map(
      state.companies.map((c) => [
        c.id,
        state.players.find((p) => p.id === c.player_id)?.nickname ?? c.name
      ])
    );
  }, [state]);

  const eventFeed = useMemo((): FeedEvent[] => {
    if (!state) return [];
    const feed: FeedEvent[] = [];

    if (state.current_event) {
      const ev = state.current_event.event;
      feed.push({
        key: state.current_event.id,
        roundNumber: state.session.current_round_number,
        category: ev.category,
        severity: ev.severity,
        title: ev.title,
        narrative: ev.narrative,
        effects: ev.effects
      });
    }

    for (let i = state.timeline.length - 1; i >= 0; i--) {
      const entry = state.timeline[i];
      if (entry.event) {
        feed.push({
          key: `timeline-r${entry.round_number}`,
          roundNumber: entry.round_number,
          category: entry.event.category,
          severity: entry.event.severity,
          title: entry.event.title,
          narrative: entry.event.narrative,
          effects: null
        });
      }
    }

    return feed;
  }, [state]);

  if (error) {
    return (
      <div className="wr-center">
        <p className="wr-error">SESSION NOT FOUND — {sessionCode}</p>
        <p className="small" style={{ color: "var(--muted)" }}>{error}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="wr-center">
        <p className="wr-loading">CONNECTING TO {sessionCode}…</p>
      </div>
    );
  }

  const currentRound = state.session.current_round_number;
  const totalRounds = state.session.total_rounds;
  const liveIndicator = realtimeStatus === "live";

  return (
    <div className="wr-root">
      {/* Full-width header bar */}
      <header className="wr-header">
        <Monitor size={14} color="#c084fc" />
        <span className="wr-header-code">{sessionCode}</span>
        <span className="wr-header-divider" />
        <span className="wr-header-label">ROUND {currentRound} / {totalRounds}</span>
        <span className="wr-header-divider" />
        <span className={`wr-header-label ${liveIndicator ? "wr-live" : ""}`}>
          <span className="wr-dot" style={{ background: liveIndicator ? "var(--good)" : "var(--muted)" }} />
          {liveIndicator ? "LIVE" : "CONNECTING"}
        </span>
      </header>

      {/* Two-panel body */}
      <div className="wr-body">
        {/* LEFT — Leaderboard */}
        <section className="wr-panel wr-panel-left">
          <div className="wr-panel-header">
            <span className="wr-dot wr-dot-blink" />
            <span className="wr-panel-title">COMBAT RANKINGS</span>
            <span className="wr-panel-sub">ROUND {currentRound} / {totalRounds}</span>
          </div>

          {scores.length === 0 ? (
            <p className="wr-empty">Awaiting players…</p>
          ) : (
            <ol className="wr-rank-list">
              {scores.map((entry) => {
                const name = companyNameById.get(entry.company_id) ?? entry.company_id;
                const nickname = playerNicknameByCompanyId.get(entry.company_id);
                const rankColor = RANK_COLORS[entry.rank - 1] ?? "var(--muted)";
                const pct = Math.round(entry.total_score * 100);
                const dims = entry.dimension_scores;

                return (
                  <li key={entry.company_id} className="wr-rank-row">
                    <span
                      className="wr-rank-num"
                      style={{ color: entry.rank <= 3 ? rankColor : "var(--muted)" }}
                    >
                      #{entry.rank}
                    </span>
                    <div className="wr-rank-info">
                      <span className="wr-rank-name">{name}</span>
                      {nickname && nickname !== name && (
                        <span className="wr-rank-nickname">{nickname}</span>
                      )}
                      <div className="wr-dim-bars">
                        {(
                          [
                            ["FIN", dims.financial],
                            ["MKT", dims.market_position],
                            ["PPL", dims.people],
                            ["RISK", dims.risk_and_robustness],
                            ["REP", dims.reputation]
                          ] as [string, number][]
                        ).map(([label, val]) => (
                          <div key={label} className="wr-dim-bar-wrap">
                            <span className="wr-dim-label">{label}</span>
                            <div className="wr-dim-track">
                              <div
                                className="wr-dim-fill"
                                style={{ width: `${Math.round(val * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span
                      className="wr-rank-score"
                      style={{ color: entry.rank <= 3 ? rankColor : "var(--ink)" }}
                    >
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* RIGHT — Event feed */}
        <section className="wr-panel wr-panel-right">
          <div className="wr-panel-header">
            <span className="wr-dot wr-dot-blink" />
            <span className="wr-panel-title">THREAT INTEL</span>
          </div>

          {eventFeed.length === 0 ? (
            <p className="wr-empty">No events yet.</p>
          ) : (
            <ul className="wr-event-list">
              {eventFeed.map((ev) => {
                const severityColor =
                  ev.severity === "high"
                    ? "var(--bad)"
                    : ev.severity === "medium"
                    ? "#f59e0b"
                    : "var(--good)";

                return (
                  <li key={ev.key} className="wr-event-card">
                    <div className="wr-event-meta">
                      <span
                        className="wr-badge"
                        style={{ color: severityColor, borderColor: severityColor }}
                      >
                        {ev.severity === "medium" ? "MED" : ev.severity.toUpperCase()}
                      </span>
                      <span className="wr-tag">{ev.category.toUpperCase()}</span>
                      <span className="wr-round-tag">R{ev.roundNumber}</span>
                    </div>
                    <p className="wr-event-title">{ev.title}</p>
                    <p className="wr-event-narrative">{ev.narrative}</p>
                    {ev.effects && Object.keys(ev.effects).length > 0 && (
                      <p className="wr-event-effects">
                        {Object.entries(ev.effects).map(([key, val], i) => (
                          <span key={key}>
                            {i > 0 && <span className="wr-dot-sep"> · </span>}
                            <span
                              style={{ color: (val ?? 0) >= 0 ? "var(--good)" : "var(--bad)" }}
                            >
                              {METRIC_LABELS[key as MetricKey]} {(val ?? 0) >= 0 ? "+" : ""}{val}
                            </span>
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <style>{`
        .wr-root {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto 1fr;
          background: var(--bg);
          overflow: hidden;
        }

        /* Header */
        .wr-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 1.5rem;
          border-bottom: 1px solid var(--line-hard);
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
          background: rgba(10, 14, 23, 0.95);
        }

        .wr-header-code {
          color: #c084fc;
          font-weight: 700;
        }

        .wr-header-divider {
          width: 1px;
          height: 10px;
          background: var(--line-hard);
        }

        .wr-header-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .wr-live {
          color: var(--good);
        }

        /* Body */
        .wr-body {
          display: grid;
          grid-template-columns: 60fr 40fr;
          overflow: hidden;
          height: calc(100vh - 40px);
        }

        /* Panels */
        .wr-panel {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 1.25rem 1.5rem;
        }

        .wr-panel-left {
          border-right: 1px solid var(--line-hard);
        }

        .wr-panel-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 1rem;
          flex-shrink: 0;
        }

        .wr-panel-title {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
        }

        .wr-panel-sub {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.14em;
          color: var(--muted);
          margin-left: auto;
        }

        .wr-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--muted);
          flex-shrink: 0;
        }

        .wr-dot-blink {
          background: var(--good);
          box-shadow: 0 0 8px var(--good-glow);
          animation: blink 2s ease-in-out infinite;
        }

        .wr-empty {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 2rem 0;
          text-align: center;
        }

        /* Leaderboard */
        .wr-rank-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow-y: auto;
        }

        .wr-rank-row {
          display: grid;
          grid-template-columns: 2.5rem 1fr auto;
          align-items: start;
          gap: 0.75rem;
          padding: 0.75rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--line-hard);
          border-radius: 6px;
        }

        .wr-rank-num {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.3rem;
          line-height: 1;
          padding-top: 0.1rem;
        }

        .wr-rank-info {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          min-width: 0;
        }

        .wr-rank-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .wr-rank-nickname {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: var(--muted);
          text-transform: uppercase;
        }

        .wr-dim-bars {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          margin-top: 0.2rem;
        }

        .wr-dim-bar-wrap {
          display: grid;
          grid-template-columns: 2.5rem 1fr;
          align-items: center;
          gap: 0.4rem;
        }

        .wr-dim-label {
          font-family: var(--font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          color: var(--muted);
          text-transform: uppercase;
        }

        .wr-dim-track {
          height: 4px;
          background: rgba(255,255,255,0.06);
          border-radius: 2px;
          overflow: hidden;
        }

        .wr-dim-fill {
          height: 100%;
          background: var(--cyan);
          border-radius: 2px;
          transition: width 600ms ease;
        }

        .wr-rank-score {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.6rem;
          line-height: 1;
          padding-top: 0.1rem;
          min-width: 3ch;
          text-align: right;
        }

        /* Event feed */
        .wr-event-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          overflow-y: auto;
        }

        .wr-event-card {
          padding: 0.85rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--line-hard);
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .wr-event-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .wr-badge {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          border: 1px solid;
          border-radius: 3px;
          padding: 0.1rem 0.35rem;
        }

        .wr-tag {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .wr-round-tag {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.1em;
          color: var(--muted);
          margin-left: auto;
        }

        .wr-event-title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 0.95rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .wr-event-narrative {
          margin: 0;
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.5;
        }

        .wr-event-effects {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          letter-spacing: 0.06em;
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .wr-dot-sep {
          color: var(--muted);
        }

        /* Center states */
        .wr-center {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }

        .wr-loading, .wr-error {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .wr-loading { color: var(--muted); }
        .wr-error { color: var(--bad); }
      `}</style>
    </div>
  );
}
