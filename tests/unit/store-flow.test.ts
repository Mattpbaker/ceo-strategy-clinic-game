import { beforeEach, describe, expect, it } from "vitest";

import { getGameStore } from "@/lib/store";

describe("store session flow", () => {
  beforeEach(() => {
    getGameStore().resetForTests();
  });

  it("supports create -> join -> decide -> interact -> resolve", () => {
    const store = getGameStore();
    const session = store.createSession({ facilitator_name: "Coach", total_rounds: 2 });

    const alpha = store.joinSession({ session_ref: session.code, nickname: "Alpha" });
    const beta = store.joinSession({ session_ref: session.code, nickname: "Beta" });

    store.controlSession(session.code, "start");
    store.controlSession(session.code, "advance_to_interaction");

    const state = store.getSessionState(session.code);
    expect(state.current_round).toBeDefined();

    const roundId = state.current_round!.id;

    store.submitDecision(roundId, alpha.player.id, {
      budget_split: {
        growth: 35,
        people: 20,
        resilience: 20,
        brand: 15,
        compliance: 10
      },
      focus_action: "expand_market",
      risk_posture: "aggressive"
    });

    store.submitDecision(roundId, beta.player.id, {
      budget_split: {
        growth: 15,
        people: 25,
        resilience: 25,
        brand: 15,
        compliance: 20
      },
      focus_action: "risk_mitigation",
      risk_posture: "balanced"
    });

    const proposal = store.proposeInteraction({
      session_id: session.id,
      round_id: roundId,
      proposer_company_id: alpha.company.id,
      target_company_id: beta.company.id,
      type: "trade_contract",
      terms: {
        intensity: 70
      }
    });

    store.respondInteraction({
      proposal_id: proposal.id,
      responder_company_id: beta.company.id,
      response: "accept"
    });

    const resolved = store.resolveCurrentRound(session.code);

    expect(resolved.resolution.round_number).toBe(1);
    expect(resolved.leaderboard.length).toBe(2);

    const betaInbox = store.listInteractionMessages(session.code, {
      company_id: beta.company.id,
      direction: "inbox"
    });
    expect(betaInbox.total).toBe(1);
    expect(betaInbox.messages[0].status).toBe("accepted");

    const results = store.getResults(session.code);
    expect(results.performance_series.length).toBe(2);
    expect(results.performance_series[0].points[0]?.round_number).toBe(1);

    const nextState = store.getSessionState(session.code);
    expect(nextState.session.current_round_number).toBe(2);
    expect(nextState.timeline.length).toBe(1);
  });
});
