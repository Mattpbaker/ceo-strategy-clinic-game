import { CompanyMetrics } from "@/lib/types";

export const TOTAL_ROUNDS = 6;

export const METRIC_BOUNDS: Record<keyof CompanyMetrics, { min: number; max: number }> = {
  cash: { min: 0, max: 200 },
  revenue_growth: { min: -20, max: 40 },
  market_share: { min: 0, max: 100 },
  talent_morale: { min: 0, max: 100 },
  operational_resilience: { min: 0, max: 100 },
  brand_reputation: { min: 0, max: 100 },
  regulatory_risk: { min: 0, max: 100 }
};

export const STARTING_METRICS: CompanyMetrics = {
  cash: 100,
  revenue_growth: 4,
  market_share: 10,
  talent_morale: 65,
  operational_resilience: 55,
  brand_reputation: 55,
  regulatory_risk: 35
};

export const SCORE_WEIGHTS = {
  financial: 0.35,
  market_position: 0.15,
  people: 0.15,
  risk_and_robustness: 0.2,
  reputation: 0.15
} as const;
