import { describe, expect, it } from "vitest";

import { resolveRound } from "@/lib/resolver";
import { Company, DecisionRecord, EventCard, InteractionProposal, Round, Session } from "@/lib/types";

const now = new Date().toISOString();

function createSession(): Session {
  return {
    id: "ses_1",
    code: "ABC123",
    facilitator_name: "Facilitator",
    status: "running",
    total_rounds: 6,
    current_round_number: 1,
    seed: "seed_fixed",
    created_at: now,
    updated_at: now
  };
}

function createRound(): Round {
  return {
    id: "rnd_1",
    session_id: "ses_1",
    round_number: 1,
    phase: "interaction",
    started_at: now,
    resolved_at: null,
    created_at: now
  };
}

function createCompanies(): Company[] {
  return [
    {
      id: "com_a",
      session_id: "ses_1",
      player_id: "ply_a",
      name: "Alpha",
      metrics: {
        cash: 100,
        revenue_growth: 4,
        market_share: 20,
        talent_morale: 65,
        operational_resilience: 55,
        brand_reputation: 60,
        regulatory_risk: 30
      },
      created_at: now,
      updated_at: now
    },
    {
      id: "com_b",
      session_id: "ses_1",
      player_id: "ply_b",
      name: "Beta",
      metrics: {
        cash: 100,
        revenue_growth: 4,
        market_share: 20,
        talent_morale: 65,
        operational_resilience: 55,
        brand_reputation: 60,
        regulatory_risk: 30
      },
      created_at: now,
      updated_at: now
    }
  ];
}

function createDecisions(): DecisionRecord[] {
  return [
    {
      id: "dec_1",
      session_id: "ses_1",
      round_id: "rnd_1",
      player_id: "ply_a",
      company_id: "com_a",
      payload: {
        budget_split: {
          growth: 30,
          people: 20,
          resilience: 20,
          brand: 20,
          compliance: 10
        },
        focus_action: "expand_market",
        risk_posture: "aggressive"
      },
      created_at: now
    },
    {
      id: "dec_2",
      session_id: "ses_1",
      round_id: "rnd_1",
      player_id: "ply_b",
      company_id: "com_b",
      payload: {
        budget_split: {
          growth: 15,
          people: 25,
          resilience: 25,
          brand: 20,
          compliance: 15
        },
        focus_action: "risk_mitigation",
        risk_posture: "balanced"
      },
      created_at: now
    }
  ];
}

function createEvent(): EventCard {
  return {
    id: "evt_1",
    category: "economic",
    severity: "medium",
    title: "Input Cost Surge",
    narrative: "Costs increase.",
    effects: {
      cash: -6,
      operational_resilience: -3,
      regulatory_risk: 2
    },
    created_at: now
  };
}

function createInteractions(): InteractionProposal[] {
  return [
    {
      id: "int_1",
      session_id: "ses_1",
      round_id: "rnd_1",
      proposer_company_id: "com_a",
      target_company_id: "com_b",
      type: "trade_contract",
      terms: {
        intensity: 60
      },
      status: "accepted",
      expires_at: now,
      created_at: now,
      updated_at: now
    }
  ];
}

describe("resolveRound", () => {
  it("is deterministic for the same seed and inputs", () => {
    const input = {
      session: createSession(),
      round: createRound(),
      companies: createCompanies(),
      decisions: createDecisions(),
      interactions: createInteractions(),
      event: createEvent()
    };

    const first = resolveRound(input);
    const second = resolveRound(input);

    expect(first.resolution.metric_deltas).toEqual(second.resolution.metric_deltas);
    expect(
      first.updatedCompanies.map(({ updated_at: _updatedAt, ...company }) => company)
    ).toEqual(
      second.updatedCompanies.map(({ updated_at: _updatedAt, ...company }) => company)
    );
  });

  it("applies cooperative trade benefits to both companies", () => {
    const output = resolveRound({
      session: createSession(),
      round: createRound(),
      companies: createCompanies(),
      decisions: createDecisions(),
      interactions: createInteractions(),
      event: createEvent()
    });

    const alpha = output.updatedCompanies.find((company) => company.id === "com_a");
    const beta = output.updatedCompanies.find((company) => company.id === "com_b");

    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(alpha!.metrics.cash).toBeGreaterThan(90);
    expect(beta!.metrics.cash).toBeGreaterThan(90);
  });
});
