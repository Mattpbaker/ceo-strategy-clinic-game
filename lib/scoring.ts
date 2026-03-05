import { METRIC_BOUNDS, SCORE_WEIGHTS } from "@/lib/constants";
import { Company, ScoreBreakdown } from "@/lib/types";
import { normalize } from "@/lib/utils";

function financialScore(company: Company): number {
  const cash = normalize(company.metrics.cash, METRIC_BOUNDS.cash.min, METRIC_BOUNDS.cash.max);
  const growth = normalize(
    company.metrics.revenue_growth,
    METRIC_BOUNDS.revenue_growth.min,
    METRIC_BOUNDS.revenue_growth.max
  );
  return (cash + growth) / 2;
}

function marketPositionScore(company: Company): number {
  return normalize(
    company.metrics.market_share,
    METRIC_BOUNDS.market_share.min,
    METRIC_BOUNDS.market_share.max
  );
}

function peopleScore(company: Company): number {
  return normalize(
    company.metrics.talent_morale,
    METRIC_BOUNDS.talent_morale.min,
    METRIC_BOUNDS.talent_morale.max
  );
}

function riskAndRobustnessScore(company: Company): number {
  const resilience = normalize(
    company.metrics.operational_resilience,
    METRIC_BOUNDS.operational_resilience.min,
    METRIC_BOUNDS.operational_resilience.max
  );
  const inverseRisk = normalize(
    METRIC_BOUNDS.regulatory_risk.max - company.metrics.regulatory_risk,
    METRIC_BOUNDS.regulatory_risk.min,
    METRIC_BOUNDS.regulatory_risk.max
  );
  return (resilience + inverseRisk) / 2;
}

function reputationScore(company: Company): number {
  return normalize(
    company.metrics.brand_reputation,
    METRIC_BOUNDS.brand_reputation.min,
    METRIC_BOUNDS.brand_reputation.max
  );
}

export function scoreCompanies(companies: Company[]): ScoreBreakdown[] {
  const scored = companies.map((company) => {
    const dimensions = {
      financial: financialScore(company),
      market_position: marketPositionScore(company),
      people: peopleScore(company),
      risk_and_robustness: riskAndRobustnessScore(company),
      reputation: reputationScore(company)
    };

    const total =
      dimensions.financial * SCORE_WEIGHTS.financial +
      dimensions.market_position * SCORE_WEIGHTS.market_position +
      dimensions.people * SCORE_WEIGHTS.people +
      dimensions.risk_and_robustness * SCORE_WEIGHTS.risk_and_robustness +
      dimensions.reputation * SCORE_WEIGHTS.reputation;

    return {
      company_id: company.id,
      dimension_scores: {
        financial: round(dimensions.financial),
        market_position: round(dimensions.market_position),
        people: round(dimensions.people),
        risk_and_robustness: round(dimensions.risk_and_robustness),
        reputation: round(dimensions.reputation)
      },
      total_score: round(total),
      rank: 0
    };
  });

  scored.sort((a, b) => b.total_score - a.total_score);

  return scored.map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
