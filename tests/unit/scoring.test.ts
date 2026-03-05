import { describe, expect, it } from "vitest";

import { scoreCompanies } from "@/lib/scoring";
import { Company } from "@/lib/types";

function company(overrides: Partial<Company>): Company {
  return {
    id: "com_default",
    session_id: "ses_test",
    player_id: "ply_test",
    name: "Default Co",
    metrics: {
      cash: 100,
      revenue_growth: 4,
      market_share: 10,
      talent_morale: 60,
      operational_resilience: 55,
      brand_reputation: 50,
      regulatory_risk: 35
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

describe("scoreCompanies", () => {
  it("ranks companies by weighted balanced scorecard total", () => {
    const high = company({
      id: "com_high",
      name: "High Co",
      metrics: {
        cash: 170,
        revenue_growth: 22,
        market_share: 35,
        talent_morale: 78,
        operational_resilience: 80,
        brand_reputation: 81,
        regulatory_risk: 20
      }
    });

    const low = company({
      id: "com_low",
      name: "Low Co",
      metrics: {
        cash: 55,
        revenue_growth: -8,
        market_share: 8,
        talent_morale: 45,
        operational_resilience: 40,
        brand_reputation: 35,
        regulatory_risk: 68
      }
    });

    const leaderboard = scoreCompanies([low, high]);

    expect(leaderboard[0].company_id).toBe("com_high");
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].company_id).toBe("com_low");
    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[0].total_score).toBeGreaterThan(leaderboard[1].total_score);
  });

  it("handles regulatory risk inversely in risk and robustness", () => {
    const resilientHighRisk = company({
      id: "com_a",
      metrics: {
        cash: 100,
        revenue_growth: 5,
        market_share: 20,
        talent_morale: 60,
        operational_resilience: 95,
        brand_reputation: 60,
        regulatory_risk: 95
      }
    });

    const balanced = company({
      id: "com_b",
      metrics: {
        cash: 100,
        revenue_growth: 5,
        market_share: 20,
        talent_morale: 60,
        operational_resilience: 70,
        brand_reputation: 60,
        regulatory_risk: 25
      }
    });

    const leaderboard = scoreCompanies([resilientHighRisk, balanced]);
    const riskA = leaderboard.find((entry) => entry.company_id === "com_a");
    const riskB = leaderboard.find((entry) => entry.company_id === "com_b");

    expect(riskA).toBeDefined();
    expect(riskB).toBeDefined();
    expect(riskA!.dimension_scores.risk_and_robustness).toBeLessThan(
      riskB!.dimension_scores.risk_and_robustness
    );
  });
});
