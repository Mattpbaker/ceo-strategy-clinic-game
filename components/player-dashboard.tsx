"use client";

import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import { Company, SessionResults, SessionState } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface PlayerDashboardProps {
  sessionRef: string;
}

export function PlayerDashboard({ sessionRef }: PlayerDashboardProps): React.ReactElement {
  const searchParams = useSearchParams();
  const [playerId, setPlayerId] = useState(searchParams.get("playerId") || "");
  const [state, setState] = useState<SessionState | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [interactionType, setInteractionType] = useState<
    "trade_contract" | "joint_venture" | "price_war" | "talent_poach" | "reputation_challenge"
  >("trade_contract");
  const [interactionIntensity, setInteractionIntensity] = useState(50);

  const load = useCallback(async () => {
    try {
      const sessionState = await fetchApi<SessionState>(`/api/sessions/${sessionRef}/state`);
      setState(sessionState);
      const sessionResults = await fetchApi<SessionResults>(`/api/sessions/${sessionRef}/results`);
      setResults(sessionResults);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load session state");
    }
  }, [sessionRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const realtimeTables = useMemo(
    () => [
      "sessions",
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
    channelKey: "player-live",
    tables: realtimeTables,
    onChange: load
  });

  const myCompany = useMemo(() => {
    if (!state || !playerId) {
      return null;
    }
    return state.companies.find((company) => company.player_id === playerId) ?? null;
  }, [state, playerId]);

  useEffect(() => {
    if (!state || !myCompany) {
      return;
    }

    const payload = {
      coordinate_system: "No spatial coordinates. Turn-based strategic simulation.",
      session_status: state.session.status,
      round_number: state.session.current_round_number,
      round_phase: state.current_round?.phase,
      player_company: {
        id: myCompany.id,
        name: myCompany.name,
        metrics: myCompany.metrics
      },
      current_event: state.current_event
        ? {
            category: state.current_event.event.category,
            severity: state.current_event.event.severity,
            title: state.current_event.event.title
          }
        : null,
      pending_interactions_for_player: state.pending_interactions.filter(
        (proposal) => proposal.target_company_id === myCompany.id
      )
    };

    (window as Window & { render_game_to_text?: () => string }).render_game_to_text =
      () => JSON.stringify(payload);

    (window as Window & { advanceTime?: (ms: number) => void }).advanceTime = (_ms: number) => {
      void load();
    };
  }, [load, myCompany, state]);

  useEffect(() => {
    if (!targetCompanyId && state && myCompany) {
      const firstTarget = state.companies.find((company) => company.id !== myCompany.id);
      if (firstTarget) {
        setTargetCompanyId(firstTarget.id);
      }
    }
  }, [myCompany, state, targetCompanyId]);

  async function submitDecision(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!state?.current_round || !playerId) {
      setError("Missing player or round context");
      return;
    }

    try {
      await fetchApi(`/api/rounds/${state.current_round.id}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          player_id: playerId,
          budget_split: budget,
          focus_action: focusAction,
          risk_posture: riskPosture
        })
      });
      setStatusMessage("Decision submitted.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit decision");
    }
  }

  async function createInteraction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!state?.current_round || !myCompany || !targetCompanyId) {
      setError("Interaction requires an active round and target company");
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
            intensity: interactionIntensity
          }
        })
      });
      setStatusMessage("Interaction proposal sent.");
      await load();
    } catch (proposalError) {
      setError(proposalError instanceof Error ? proposalError.message : "Unable to send proposal");
    }
  }

  async function respondToProposal(proposalId: string, response: "accept" | "reject"): Promise<void> {
    if (!myCompany) {
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
      await load();
    } catch (respondError) {
      setError(respondError instanceof Error ? respondError.message : "Unable to respond to proposal");
    }
  }

  const incomingProposals = useMemo(() => {
    if (!state || !myCompany) {
      return [];
    }
    return state.pending_interactions.filter((proposal) => proposal.target_company_id === myCompany.id);
  }, [myCompany, state]);

  const otherCompanies: Company[] = useMemo(() => {
    if (!state || !myCompany) {
      return [];
    }
    return state.companies.filter((company) => company.id !== myCompany.id);
  }, [myCompany, state]);

  if (!state) {
    return (
      <main className="page">
        <p>Loading session...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>Player Dashboard</h1>
        <p>
          Session <b>{state.session.code}</b> | Round {state.session.current_round_number} of{" "}
          {state.session.total_rounds}
        </p>
        <div className="inline">
          <span className={`badge status-${state.session.status}`}>{state.session.status.toUpperCase()}</span>
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
          {state.current_round ? <span className="badge">Phase: {state.current_round.phase}</span> : null}
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Your Identity</h2>
          <label>
            Player ID
            <input
              value={playerId}
              onChange={(event) => setPlayerId(event.target.value)}
              placeholder="Paste your player ID if not in URL"
            />
          </label>
          <p className="small">Player ID is included in the join redirect URL.</p>

          {myCompany ? (
            <div>
              <p>
                <b>{myCompany.name}</b>
              </p>
              <div className="metrics-grid">
                {Object.entries(myCompany.metrics).map(([key, value]) => (
                  <div className="metric" key={key}>
                    <span className="small">{key}</span>
                    <b>{value.toFixed(1)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="small">Enter your player ID to unlock decision controls.</p>
          )}
        </article>

        <article className="card">
          <h2>Round Event</h2>
          {state.current_event ? (
            <>
              <p>
                <b>{state.current_event.event.title}</b>
              </p>
              <p className="small">
                {state.current_event.event.category} / {state.current_event.event.severity}
              </p>
              <p>{state.current_event.event.narrative}</p>
            </>
          ) : (
            <p className="small">Event is revealed once round resolution occurs or facilitator injects one.</p>
          )}
        </article>
      </section>

      {myCompany && state.current_round ? (
        <section className="grid">
          <article className="card">
            <h3>Submit Strategic Decision</h3>
            <form onSubmit={submitDecision}>
              <div className="metrics-grid">
                {Object.entries(budget).map(([key, value]) => (
                  <label key={key}>
                    {key}
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
              <button type="submit">Submit decision</button>
            </form>
          </article>

          <article className="card">
            <h3>Propose Company Interaction</h3>
            <form onSubmit={createInteraction}>
              <label>
                Target company
                <select
                  value={targetCompanyId}
                  onChange={(event) => setTargetCompanyId(event.target.value)}
                  required
                >
                  <option value="">Select company</option>
                  {otherCompanies.map((company) => (
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
                  onChange={(event) => setInteractionType(event.target.value as typeof interactionType)}
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
              <button type="submit">Send proposal</button>
            </form>
          </article>
        </section>
      ) : null}

      {myCompany ? (
        <section className="card">
          <h3>Incoming Proposals</h3>
          {incomingProposals.length === 0 ? (
            <p className="small">No pending proposals for your company.</p>
          ) : (
            incomingProposals.map((proposal) => {
              const proposer = state.companies.find((company) => company.id === proposal.proposer_company_id);
              return (
                <div className="notice" key={proposal.id}>
                  <p>
                    <b>{proposal.type}</b> from {proposer?.name || proposal.proposer_company_id} (intensity{" "}
                    {proposal.terms.intensity})
                  </p>
                  <div className="inline">
                    <button onClick={() => void respondToProposal(proposal.id, "accept")}>Accept</button>
                    <button className="secondary" onClick={() => void respondToProposal(proposal.id, "reject")}>
                      Reject
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      ) : null}

      <section className="card">
        <h3>Leaderboard</h3>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Company</th>
              <th>Total Score</th>
            </tr>
          </thead>
          <tbody>
            {(results?.leaderboard || []).map((entry) => {
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
      </section>

      {state.session.status === "completed" ? (
        <section className="card">
          <h3>Decision Timeline</h3>
          {(results?.decision_timeline || []).map((entry) => (
            <div className="notice" key={entry.round_number}>
              <p>
                <b>Round {entry.round_number}</b> - {entry.event.title} ({entry.event.category},
                {" "}
                {entry.event.severity})
              </p>
              <p className="small">{entry.event.narrative}</p>
              <p className="small">Decisions: {entry.decisions.length} | Interactions: {entry.interactions.length}</p>
            </div>
          ))}
        </section>
      ) : null}

      {statusMessage ? <p className="notice">{statusMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
