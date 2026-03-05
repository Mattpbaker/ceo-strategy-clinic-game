"use client";

import { fetchApi } from "@/lib/http-client";
import { useSessionRealtime } from "@/lib/use-session-realtime";
import { Company, SessionResults, SessionState } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface PlayerDashboardProps {
  sessionRef: string;
}

const interactionTypeLabels: Record<
  "trade_contract" | "joint_venture" | "price_war" | "talent_poach" | "reputation_challenge",
  string
> = {
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

function formatShortTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleTimeString([], {
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

  const decisionStorageKey = useMemo(() => {
    const normalized = playerId.trim();
    if (!normalized) {
      return null;
    }
    return `ceo-clinic:${sessionRef}:player:${normalized}:decision-rounds`;
  }, [playerId, sessionRef]);

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
    return state.companies.find((company) => company.player_id === playerId.trim()) ?? null;
  }, [state, playerId]);

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

  useEffect(() => {
    if (!targetCompanyId && state && myCompany) {
      const firstTarget = state.companies.find((company) => company.id !== myCompany.id);
      if (firstTarget) {
        setTargetCompanyId(firstTarget.id);
      }
    }
  }, [myCompany, state, targetCompanyId]);

  const currentRound = state?.current_round ?? null;
  const currentRoundNumber = currentRound?.round_number ?? state?.session.current_round_number ?? null;
  const sessionStatus = state?.session.status ?? "waiting";
  const roundPhase = currentRound?.phase ?? "pending";
  const sessionAcceptsActions = sessionStatus === "running" || sessionStatus === "paused";
  const decisionWindowOpen = roundPhase === "decision" || roundPhase === "interaction";
  const interactionWindowOpen = decisionWindowOpen;
  const hasSubmittedCurrentRound =
    currentRoundNumber !== null && submittedRounds.includes(currentRoundNumber);
  const budgetTotal =
    budget.growth + budget.people + budget.resilience + budget.brand + budget.compliance;
  const myLeaderboardEntry = useMemo(() => {
    if (!results || !myCompany) {
      return null;
    }
    return results.leaderboard.find((entry) => entry.company_id === myCompany.id) ?? null;
  }, [results, myCompany]);

  const decisionBlockedReason = useMemo(() => {
    if (!myCompany) {
      return "Enter your player ID to unlock decision controls.";
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
      return "Enter your player ID to unlock interaction controls.";
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
      return "Enter your player ID to respond to proposals.";
    }
    if (!sessionAcceptsActions) {
      return "Proposal responses are locked because the session is not active.";
    }
    if (!currentRound) {
      return "No active round is available yet.";
    }
    return null;
  }, [currentRound, myCompany, sessionAcceptsActions]);

  const nextAction = useMemo(() => {
    if (!myCompany) {
      return {
        title: "Step 1: Confirm your company identity",
        detail: "Enter your player ID to connect this dashboard to your company."
      };
    }

    if (sessionStatus === "waiting") {
      return {
        title: "Waiting for facilitator start",
        detail: "Your company is ready. Review your metrics and wait for the game to begin."
      };
    }

    if (sessionStatus === "completed") {
      return {
        title: "Session complete",
        detail: "Review the final leaderboard and decision timeline below."
      };
    }

    if (!currentRound) {
      return {
        title: "No round context available",
        detail: "Realtime may still be syncing. Keep this page open."
      };
    }

    if (!hasSubmittedCurrentRound) {
      return {
        title: "Step 3: Submit your strategic decision",
        detail: "Set budget split, focus action, and risk posture, then submit."
      };
    }

    if (roundPhase === "decision") {
      return {
        title: "Decision submitted",
        detail: "You can update your decision or prepare interactions while waiting for phase change."
      };
    }

    if (roundPhase === "interaction" && incomingProposals.length > 0) {
      return {
        title: "Step 5: Respond to incoming proposals",
        detail: "Accept or reject pending proposals targeting your company."
      };
    }

    if (roundPhase === "interaction") {
      return {
        title: "Step 4: Manage interactions",
        detail: "Send proposals to peers or wait for facilitator round resolution."
      };
    }

    return {
      title: "Awaiting round transition",
      detail: "The round is resolved; watch for the next round opening."
    };
  }, [
    currentRound,
    hasSubmittedCurrentRound,
    incomingProposals.length,
    myCompany,
    roundPhase,
    sessionStatus
  ]);

  useEffect(() => {
    if (!state || !myCompany) {
      return;
    }

    const payload = {
      coordinate_system: "No spatial coordinates. Turn-based strategic simulation.",
      session_status: state.session.status,
      round_number: state.session.current_round_number,
      round_phase: state.current_round?.phase,
      next_action: nextAction.title,
      decision_submitted_this_round: hasSubmittedCurrentRound,
      decision_window_open: decisionWindowOpen,
      interaction_window_open: interactionWindowOpen,
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
  }, [
    decisionWindowOpen,
    hasSubmittedCurrentRound,
    interactionWindowOpen,
    load,
    myCompany,
    nextAction.title,
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
      setStatusMessage("Decision submitted. You can re-submit any time before resolve.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit decision");
    }
  }

  async function createInteraction(event: FormEvent<HTMLFormElement>): Promise<void> {
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
      await load();
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
          {currentRound ? <span className="badge">Phase: {formatPhase(currentRound.phase)}</span> : null}
        </div>
      </section>

      <section className="card flow-guide">
        <h2>Round Guide</h2>
        <p>
          <b>{nextAction.title}</b>
        </p>
        <p className="small">{nextAction.detail}</p>
        <div className="flow-steps">
          <div className={`flow-step ${myCompany ? "done" : "current"}`}>
            <p className="flow-step-title">Step 1: Confirm identity</p>
            <p className="small">
              {myCompany ? `Connected as ${myCompany.name}.` : "Enter your player ID to unlock actions."}
            </p>
          </div>
          <div className={`flow-step ${hasSubmittedCurrentRound ? "done" : "current"}`}>
            <p className="flow-step-title">Step 2: Submit decision</p>
            <p className="small">
              {hasSubmittedCurrentRound
                ? "Decision is in for this round."
                : "Set budget, focus action, and risk posture."}
            </p>
          </div>
          <div className={`flow-step ${roundPhase === "interaction" ? "current" : ""}`}>
            <p className="flow-step-title">Step 3: Handle interactions</p>
            <p className="small">
              {roundPhase === "interaction"
                ? "Interaction phase is open."
                : "You can still propose in decision phase, but this is typically used during interaction phase."}
            </p>
          </div>
          <div className={`flow-step ${state.session.status === "completed" ? "done" : ""}`}>
            <p className="flow-step-title">Step 4: Review outcomes</p>
            <p className="small">
              {state.session.status === "completed"
                ? "Session complete. Review leaderboard and timeline."
                : "Wait for facilitator resolve, then review updates."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Step 1 - Your Identity</h2>
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
              <p className="small good-text">Identity verified. Actions are now linked to your company.</p>
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
            <p className="small">Enter your player ID to unlock decision and interaction controls.</p>
          )}
        </article>

        <article className="card">
          <h2>Step 2 - Round Context</h2>
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
            <p className="small">No event shown yet. Event appears after facilitator injects or round resolves.</p>
          )}
          <p className="small">
            Session status: <b>{state.session.status}</b> | Current phase: <b>{formatPhase(roundPhase)}</b>
          </p>
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <h3>Step 3 - Submit Strategic Decision</h3>
          <form onSubmit={submitDecision}>
            <fieldset className="form-fieldset" disabled={Boolean(decisionBlockedReason)}>
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
              <button type="submit">
                {hasSubmittedCurrentRound ? "Update decision" : "Submit decision"}
              </button>
            </fieldset>
          </form>
          <p className="small">
            Budget total: <b>{budgetTotal}%</b>. The resolver normalizes totals to 100%.
          </p>
          <p className={`small ${hasSubmittedCurrentRound ? "good-text" : ""}`}>
            {hasSubmittedCurrentRound
              ? "Submitted for this round. Re-submit any time before facilitator resolve."
              : "Not yet submitted for this round."}
          </p>
          {decisionBlockedReason ? <p className="small">Locked: {decisionBlockedReason}</p> : null}
        </article>

        <article className="card">
          <h3>Step 4 - Propose Company Interaction</h3>
          {roundPhase === "decision" ? (
            <p className="small">
              Interaction proposals are accepted now, but teams usually coordinate this in interaction phase.
            </p>
          ) : null}
          <form onSubmit={createInteraction}>
            <fieldset className="form-fieldset" disabled={Boolean(interactionBlockedReason)}>
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
            </fieldset>
          </form>
          {interactionBlockedReason ? <p className="small">Locked: {interactionBlockedReason}</p> : null}
        </article>
      </section>

      <section className="card">
        <h3>Step 5 - Incoming Proposals</h3>
        {incomingProposals.length === 0 ? (
          <p className="small">No pending proposals for your company.</p>
        ) : (
          incomingProposals.map((proposal) => {
            const proposer = state.companies.find((company) => company.id === proposal.proposer_company_id);
            return (
              <div className="notice" key={proposal.id}>
                <p>
                  <b>{interactionTypeLabels[proposal.type]}</b> from{" "}
                  {proposer?.name || proposal.proposer_company_id} (intensity {proposal.terms.intensity})
                </p>
                <p className="small">Expires at {formatShortTime(proposal.expires_at)}</p>
                <div className="inline">
                  <button
                    disabled={Boolean(responseBlockedReason)}
                    onClick={() => void respondToProposal(proposal.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    className="secondary"
                    disabled={Boolean(responseBlockedReason)}
                    onClick={() => void respondToProposal(proposal.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
        {responseBlockedReason ? <p className="small">Locked: {responseBlockedReason}</p> : null}
      </section>

      <section className="grid">
        <article className="card">
          <h3>Round Snapshot</h3>
          <div className="metrics-grid">
            <div className="metric">
              <span className="small">Decision status</span>
              <b>{hasSubmittedCurrentRound ? "Submitted" : "Pending"}</b>
            </div>
            <div className="metric">
              <span className="small">Incoming proposals</span>
              <b>{incomingProposals.length}</b>
            </div>
            <div className="metric">
              <span className="small">Current phase</span>
              <b>{formatPhase(roundPhase)}</b>
            </div>
            <div className="metric">
              <span className="small">Your rank</span>
              <b>{myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : "N/A"}</b>
            </div>
          </div>
        </article>

        <article className="card">
          <h3>What Happens Next</h3>
          <p className="small">
            Facilitator controls phase changes and round resolution. Keep this page open for realtime updates.
          </p>
          <p className="small">
            Once round resolves, your metrics and leaderboard update automatically. Final timeline appears when the
            session is completed.
          </p>
        </article>
      </section>

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
                <b>Round {entry.round_number}</b> - {entry.event.title} ({entry.event.category}, {entry.event.severity})
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
    </main>
  );
}
