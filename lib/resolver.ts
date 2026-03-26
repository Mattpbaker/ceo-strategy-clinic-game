import { METRIC_BOUNDS } from "@/lib/constants";
import {
  Company,
  CompanyMetrics,
  DecisionPayload,
  DecisionRecord,
  EventCard,
  InteractionProposal,
  InteractionType,
  Round,
  RoundResolution,
  Session
} from "@/lib/types";
import { clamp, createSeededRng, nowIso } from "@/lib/utils";

interface ResolveRoundInput {
  session: Session;
  round: Round;
  companies: Company[];
  decisions: DecisionRecord[];
  interactions: InteractionProposal[];
  event: EventCard;
}

interface ResolveRoundOutput {
  updatedCompanies: Company[];
  resolution: RoundResolution;
}

const DEFAULT_DECISION: DecisionPayload = {
  budget_split: {
    growth: 20,
    people: 20,
    resilience: 20,
    brand: 20,
    compliance: 20
  },
  focus_action: "improve_efficiency",
  risk_posture: "balanced"
};

const postureCashMultiplier: Record<DecisionPayload["risk_posture"], number> = {
  conservative: 0.8,
  balanced: 1,
  aggressive: 1.2
};

const postureRiskMultiplier: Record<DecisionPayload["risk_posture"], number> = {
  conservative: 0.7,
  balanced: 1,
  aggressive: 1.35
};

export function resolveRound(input: ResolveRoundInput): ResolveRoundOutput {
  const { companies, decisions, interactions, event, round, session } = input;
  const rng = createSeededRng(`${session.seed}:${round.round_number}`);

  const baselineByCompany = new Map(companies.map((company) => [company.id, company.metrics]));
  const mutableCompanies = new Map(
    companies.map((company) => [company.id, { ...company, metrics: { ...company.metrics } }])
  );
  const decisionByCompany = new Map(
    decisions.map((decision) => [decision.company_id, decision.payload])
  );

  const explanations: string[] = [];
  const newRisks: string[] = [];

  for (const company of mutableCompanies.values()) {
    applyEvent(company.metrics, event.effects);
    const decision = decisionByCompany.get(company.id) ?? DEFAULT_DECISION;
    applyDecision(company.metrics, decision);

    if (!decisionByCompany.has(company.id)) {
      explanations.push(`${company.name} did not submit a decision; default strategy applied.`);
    }
  }

  const UNILATERAL_TYPES: InteractionType[] = ["price_war", "talent_poach", "reputation_challenge"];

  for (const interaction of interactions.sort((a, b) => a.id.localeCompare(b.id))) {
    const isUnilateral = UNILATERAL_TYPES.includes(interaction.type);
    const fires = isUnilateral
      ? interaction.status === "pending" || interaction.status === "accepted"
      : interaction.status === "accepted";
    if (!fires) {
      continue;
    }

    const proposer = mutableCompanies.get(interaction.proposer_company_id);
    const target = mutableCompanies.get(interaction.target_company_id);
    if (!proposer || !target) {
      continue;
    }

    const intensity = clamp(interaction.terms.intensity ?? 50, 10, 100) / 100;

    switch (interaction.type) {
      case "trade_contract": {
        proposer.metrics.cash += 6 * intensity;
        proposer.metrics.operational_resilience += 4 * intensity;
        target.metrics.cash += 6 * intensity;
        target.metrics.operational_resilience += 4 * intensity;
        explanations.push(`${proposer.name} and ${target.name} benefited from a trade contract.`);
        break;
      }
      case "joint_venture": {
        proposer.metrics.market_share += 2.5 * intensity;
        proposer.metrics.brand_reputation += 3 * intensity;
        proposer.metrics.cash -= 3 * intensity;

        target.metrics.market_share += 2.5 * intensity;
        target.metrics.brand_reputation += 3 * intensity;
        target.metrics.cash -= 3 * intensity;

        explanations.push(`${proposer.name} and ${target.name} launched a joint venture.`);
        break;
      }
      case "price_war": {
        proposer.metrics.market_share += 4 * intensity;
        proposer.metrics.cash -= 6 * intensity;
        proposer.metrics.brand_reputation -= 1.5 * intensity;

        target.metrics.market_share -= 3.5 * intensity;
        target.metrics.cash -= 4 * intensity;
        explanations.push(`${proposer.name} initiated a price war against ${target.name}.`);
        break;
      }
      case "talent_poach": {
        proposer.metrics.talent_morale += 5 * intensity;
        proposer.metrics.cash -= 2 * intensity;
        target.metrics.talent_morale -= 6 * intensity;
        target.metrics.operational_resilience -= 3 * intensity;

        explanations.push(`${proposer.name} poached key talent from ${target.name}.`);
        break;
      }
      case "reputation_challenge": {
        const baseBackfireChance =
          event.category === "social" || event.category === "political" ? 0.45 : 0.2;
        const backfire = rng() < baseBackfireChance + 0.15 * intensity;

        if (backfire) {
          proposer.metrics.brand_reputation -= 6 * intensity;
          proposer.metrics.regulatory_risk += 3 * intensity;
          target.metrics.brand_reputation += 2 * intensity;
          explanations.push(
            `${proposer.name}'s reputation challenge backfired and improved ${target.name}'s standing.`
          );
        } else {
          proposer.metrics.brand_reputation += 2 * intensity;
          proposer.metrics.market_share += 2 * intensity;
          target.metrics.brand_reputation -= 5 * intensity;
          target.metrics.market_share -= 1.5 * intensity;
          explanations.push(`${proposer.name} successfully damaged ${target.name}'s reputation.`);
        }
        break;
      }
      default:
        break;
    }
  }

  for (const company of mutableCompanies.values()) {
    clampMetrics(company.metrics);
    company.updated_at = nowIso();

    if (company.metrics.regulatory_risk >= 75) {
      newRisks.push(`${company.name} is exposed to elevated regulatory risk.`);
    }
    if (company.metrics.cash <= 15) {
      newRisks.push(`${company.name} is facing a near-term cash runway challenge.`);
    }
  }

  const metricDeltas: Record<string, Partial<CompanyMetrics>> = {};

  for (const company of mutableCompanies.values()) {
    const baseline = baselineByCompany.get(company.id);
    if (!baseline) {
      continue;
    }

    metricDeltas[company.id] = {
      cash: roundDelta(company.metrics.cash - baseline.cash),
      revenue_growth: roundDelta(company.metrics.revenue_growth - baseline.revenue_growth),
      market_share: roundDelta(company.metrics.market_share - baseline.market_share),
      talent_morale: roundDelta(company.metrics.talent_morale - baseline.talent_morale),
      operational_resilience: roundDelta(
        company.metrics.operational_resilience - baseline.operational_resilience
      ),
      brand_reputation: roundDelta(company.metrics.brand_reputation - baseline.brand_reputation),
      regulatory_risk: roundDelta(company.metrics.regulatory_risk - baseline.regulatory_risk)
    };
  }

  return {
    updatedCompanies: [...mutableCompanies.values()],
    resolution: {
      round_id: round.id,
      round_number: round.round_number,
      event,
      metric_deltas: metricDeltas,
      explanations,
      new_risks: newRisks
    }
  };
}

function applyEvent(metrics: CompanyMetrics, effects: EventCard["effects"]): void {
  for (const [key, value] of Object.entries(effects)) {
    const metric = key as keyof CompanyMetrics;
    const current = metrics[metric];
    if (typeof current !== "number" || typeof value !== "number") {
      continue;
    }
    metrics[metric] = current + value;
  }
}

function applyDecision(metrics: CompanyMetrics, decision: DecisionPayload): void {
  const budget = normalizeBudget(decision.budget_split);
  const cashMultiplier = postureCashMultiplier[decision.risk_posture];
  const riskMultiplier = postureRiskMultiplier[decision.risk_posture];

  metrics.revenue_growth += (budget.growth / 100) * 6 * cashMultiplier;
  metrics.market_share += (budget.growth / 100) * 4 * cashMultiplier;

  metrics.talent_morale += (budget.people / 100) * 6;
  metrics.operational_resilience += (budget.resilience / 100) * 6;
  metrics.brand_reputation += (budget.brand / 100) * 5;

  metrics.regulatory_risk -= (budget.compliance / 100) * 7;
  metrics.cash -= (budget.people + budget.resilience + budget.brand + budget.compliance) * 0.07;
  metrics.cash += (budget.growth / 100) * 5 * cashMultiplier;

  metrics.regulatory_risk += (budget.growth / 100) * 4 * riskMultiplier;

  switch (decision.focus_action) {
    case "expand_market":
      metrics.market_share += 3 * cashMultiplier;
      metrics.cash -= 4;
      metrics.regulatory_risk += 2 * riskMultiplier;
      break;
    case "improve_efficiency":
      metrics.cash += 5;
      metrics.operational_resilience += 2;
      break;
    case "invest_people":
      metrics.talent_morale += 5;
      metrics.brand_reputation += 1;
      metrics.cash -= 3;
      break;
    case "risk_mitigation":
      metrics.regulatory_risk -= 6;
      metrics.operational_resilience += 3;
      metrics.cash -= 2;
      break;
    case "brand_campaign":
      metrics.brand_reputation += 5;
      metrics.market_share += 1;
      metrics.cash -= 4;
      break;
    default:
      break;
  }
}

function normalizeBudget(budget: DecisionPayload["budget_split"]): DecisionPayload["budget_split"] {
  const sum = budget.growth + budget.people + budget.resilience + budget.brand + budget.compliance;

  if (sum <= 0) {
    return {
      growth: 20,
      people: 20,
      resilience: 20,
      brand: 20,
      compliance: 20
    };
  }

  return {
    growth: (budget.growth / sum) * 100,
    people: (budget.people / sum) * 100,
    resilience: (budget.resilience / sum) * 100,
    brand: (budget.brand / sum) * 100,
    compliance: (budget.compliance / sum) * 100
  };
}

function clampMetrics(metrics: CompanyMetrics): void {
  for (const [metric, bounds] of Object.entries(METRIC_BOUNDS)) {
    const key = metric as keyof CompanyMetrics;
    metrics[key] = clamp(metrics[key], bounds.min, bounds.max);
  }
}

function roundDelta(value: number): number {
  return Math.round(value * 100) / 100;
}
