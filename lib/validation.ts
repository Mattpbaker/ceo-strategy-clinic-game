import { z } from "zod";

export const createSessionSchema = z.object({
  facilitator_name: z.string().trim().min(2).max(60).optional(),
  total_rounds: z.number().int().min(1).max(12).optional()
});

export const joinSessionSchema = z.object({
  nickname: z.string().trim().min(2).max(40)
});

export const decisionPayloadSchema = z.object({
  player_id: z.string().trim().min(3),
  budget_split: z.object({
    growth: z.number().min(0).max(100),
    people: z.number().min(0).max(100),
    resilience: z.number().min(0).max(100),
    brand: z.number().min(0).max(100),
    compliance: z.number().min(0).max(100)
  }),
  focus_action: z.enum([
    "expand_market",
    "improve_efficiency",
    "invest_people",
    "risk_mitigation",
    "brand_campaign"
  ]),
  risk_posture: z.enum(["conservative", "balanced", "aggressive"]),
  notes: z.string().max(500).optional()
});

export const interactionProposalSchema = z.object({
  session_id: z.string().trim().min(3),
  round_id: z.string().trim().min(3),
  proposer_company_id: z.string().trim().min(3),
  target_company_id: z.string().trim().min(3),
  type: z.enum([
    "trade_contract",
    "joint_venture",
    "price_war",
    "talent_poach",
    "reputation_challenge"
  ]),
  terms: z.object({
    intensity: z.number().int().min(10).max(100),
    cash_amount: z.number().min(0).optional(),
    duration_rounds: z.number().int().min(1).max(3).optional(),
    message: z.string().max(280).optional()
  }),
  expires_in_minutes: z.number().int().min(1).max(30).optional()
});

export const interactionResponseSchema = z.object({
  responder_company_id: z.string().trim().min(3),
  response: z.enum(["accept", "reject", "counter"]),
  counter_terms: z
    .object({
      intensity: z.number().int().min(10).max(100),
      cash_amount: z.number().min(0).optional(),
      duration_rounds: z.number().int().min(1).max(3).optional(),
      message: z.string().max(280).optional()
    })
    .optional()
});

export const facilitatorEventSchema = z.object({
  category: z.enum(["economic", "social", "political"]),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().trim().min(3).max(100),
  narrative: z.string().trim().min(5).max(500),
  effects: z
    .object({
      cash: z.number().min(-60).max(60).optional(),
      revenue_growth: z.number().min(-25).max(25).optional(),
      market_share: z.number().min(-25).max(25).optional(),
      talent_morale: z.number().min(-30).max(30).optional(),
      operational_resilience: z.number().min(-30).max(30).optional(),
      brand_reputation: z.number().min(-30).max(30).optional(),
      regulatory_risk: z.number().min(-30).max(30).optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one effect is required")
});

export const facilitatorControlSchema = z.object({
  action: z.enum(["start", "pause", "resume", "advance_to_interaction"])
});

export const messageFeedQuerySchema = z.object({
  company_id: z.string().trim().min(3).optional(),
  direction: z.enum(["inbox", "outbox", "all"]).optional(),
  status: z.enum(["pending", "accepted", "rejected", "countered", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});
