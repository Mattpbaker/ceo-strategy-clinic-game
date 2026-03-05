import { EventCard, EventCategory, EventSeverity } from "@/lib/types";
import { createId, nowIso, pickOne } from "@/lib/utils";

interface EventTemplate {
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  narrative: string;
  effects: EventCard["effects"];
}

const EVENT_TEMPLATES: EventTemplate[] = [
  {
    category: "economic",
    severity: "low",
    title: "Consumer Confidence Lift",
    narrative: "Spending sentiment rises, creating room for careful expansion.",
    effects: { revenue_growth: 2, market_share: 1, cash: 3 }
  },
  {
    category: "economic",
    severity: "medium",
    title: "Input Cost Surge",
    narrative: "Commodity prices rise and margins tighten across sectors.",
    effects: { cash: -8, operational_resilience: -4, regulatory_risk: 3 }
  },
  {
    category: "economic",
    severity: "high",
    title: "Credit Market Shock",
    narrative: "Credit availability contracts sharply, stressing weaker balance sheets.",
    effects: { cash: -14, revenue_growth: -4, operational_resilience: -6 }
  },
  {
    category: "social",
    severity: "low",
    title: "Talent Upskilling Wave",
    narrative: "Workforce development incentives raise employee capability.",
    effects: { talent_morale: 4, operational_resilience: 2 }
  },
  {
    category: "social",
    severity: "medium",
    title: "Consumer Activism Trend",
    narrative: "Customers scrutinize labor and ethics standards more aggressively.",
    effects: { brand_reputation: -4, regulatory_risk: 4, talent_morale: -2 }
  },
  {
    category: "social",
    severity: "high",
    title: "Public Backlash Cycle",
    narrative: "A viral backlash punishes firms perceived as profit-only operators.",
    effects: { brand_reputation: -9, market_share: -2, regulatory_risk: 7 }
  },
  {
    category: "political",
    severity: "low",
    title: "Regulatory Clarification",
    narrative: "Clearer guidance reduces uncertainty for compliant operators.",
    effects: { regulatory_risk: -4, operational_resilience: 2 }
  },
  {
    category: "political",
    severity: "medium",
    title: "Policy Recalibration",
    narrative: "New policy requirements increase reporting overhead.",
    effects: { cash: -5, regulatory_risk: 5, operational_resilience: -2 }
  },
  {
    category: "political",
    severity: "high",
    title: "Trade Restriction Regime",
    narrative: "New restrictions disrupt partnerships and supply planning.",
    effects: { market_share: -3, cash: -10, operational_resilience: -6, regulatory_risk: 8 }
  }
];

export function createEventCard(template: EventTemplate): EventCard {
  return {
    id: createId("evt"),
    category: template.category,
    severity: template.severity,
    title: template.title,
    narrative: template.narrative,
    effects: template.effects,
    created_at: nowIso()
  };
}

export function drawEvent(seedKey: string, category?: EventCategory): EventCard {
  const pool = category
    ? EVENT_TEMPLATES.filter((template) => template.category === category)
    : EVENT_TEMPLATES;

  if (pool.length === 0) {
    throw new Error(`No events available for category: ${category}`);
  }

  const rng = seededEventRng(seedKey);
  const chosen = pickOne(pool, rng);
  return createEventCard(chosen);
}

function seededEventRng(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  let state = (hash >>> 0) + 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getEventTemplates(): EventTemplate[] {
  return EVENT_TEMPLATES;
}
