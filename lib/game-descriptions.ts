// lib/game-descriptions.ts

export const BUDGET_DESCRIPTIONS = {
  growth: "Drives revenue growth and market share. Pairs well with Expand Market focus. High growth + Aggressive posture = more upside, more volatility.",
  people: "Builds talent morale and operational resilience through your workforce. Reduces attrition risk and improves efficiency multipliers.",
  resilience: "Strengthens operational systems against shocks. Reduces the negative impact of high-severity events on your metrics.",
  brand: "Improves brand reputation and can offset regulatory risk. High-visibility focus actions amplify brand budget returns.",
  compliance: "Reduces regulatory risk exposure. Important when political events are likely. Conservative posture amplifies compliance returns.",
} as const;

export const FOCUS_ACTION_DESCRIPTIONS: Record<string, string> = {
  expand_market: "Amplifies market share and revenue gains this round. Boosts effectiveness of Growth budget.",
  improve_efficiency: "Reduces cost drag and improves resilience. Amplifies People and Resilience budget returns.",
  invest_people: "Directly improves talent morale and reduces attrition effects. Amplifies People budget.",
  risk_mitigation: "Reduces event shock impact this round. Pairs well with high Resilience and Compliance budgets.",
  brand_campaign: "Improves brand reputation and market share perception. Amplifies Brand budget returns.",
};

export const RISK_POSTURE_DESCRIPTIONS: Record<string, string> = {
  conservative: "Lower upside but protected downside. Event shocks have reduced impact. Good when a high-severity event is likely.",
  balanced: "Moderate exposure in both directions. Default starting point for most rounds.",
  aggressive: "Higher potential gains but amplified losses. Best when the event is expected to be favourable or low-severity.",
};

export interface InteractionDescription {
  type: "cooperative" | "competitive";
  beneficiary: string;
  description: string;
  intensityNote: string;
}

export const INTERACTION_DESCRIPTIONS: Record<string, InteractionDescription> = {
  trade_contract: {
    type: "cooperative",
    beneficiary: "Both companies",
    description: "A supply or distribution agreement. Both companies gain market share and revenue growth. Lower risk than a joint venture.",
    intensityNote: "Scale of mutual benefit",
  },
  joint_venture: {
    type: "cooperative",
    beneficiary: "Both companies",
    description: "Pool resources for a shared project. Both gain market share and revenue. Risk from the next event shock is shared between you.",
    intensityNote: "Payout scale for both parties",
  },
  price_war: {
    type: "competitive",
    beneficiary: "You (at cost to both)",
    description: "Undercut your target's pricing. You gain their market share but both companies take a cash hit.",
    intensityNote: "Aggression — higher = more market gained, more cash lost",
  },
  talent_poach: {
    type: "competitive",
    beneficiary: "You",
    description: "Recruit from your target's team. You gain talent morale; they lose it. Their operational resilience takes a secondary hit.",
    intensityNote: "Disruption level",
  },
  reputation_challenge: {
    type: "competitive",
    beneficiary: "You",
    description: "Publicly challenge a competitor's standing. You gain brand reputation; they lose it.",
    intensityNote: "Signal strength",
  },
};
