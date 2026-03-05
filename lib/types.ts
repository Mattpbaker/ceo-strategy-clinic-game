export type MetricKey =
  | "cash"
  | "revenue_growth"
  | "market_share"
  | "talent_morale"
  | "operational_resilience"
  | "brand_reputation"
  | "regulatory_risk";

export interface CompanyMetrics {
  cash: number;
  revenue_growth: number;
  market_share: number;
  talent_morale: number;
  operational_resilience: number;
  brand_reputation: number;
  regulatory_risk: number;
}

export type SessionStatus = "waiting" | "running" | "paused" | "completed";
export type RoundPhase = "pending" | "decision" | "interaction" | "resolved";

export interface Session {
  id: string;
  code: string;
  facilitator_name: string;
  status: SessionStatus;
  total_rounds: number;
  current_round_number: number;
  seed: string;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  session_id: string;
  nickname: string;
  role: "player" | "facilitator";
  created_at: string;
}

export interface Company {
  id: string;
  session_id: string;
  player_id: string;
  name: string;
  metrics: CompanyMetrics;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  phase: RoundPhase;
  started_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export type EventCategory = "economic" | "social" | "political";
export type EventSeverity = "low" | "medium" | "high";

export interface EventCard {
  id: string;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  narrative: string;
  effects: Partial<Record<MetricKey, number>>;
  created_at: string;
}

export interface RoundEvent {
  id: string;
  session_id: string;
  round_id: string;
  event_card_id: string;
  event: EventCard;
  source: "deck" | "facilitator";
  created_at: string;
}

export interface DecisionBudgetSplit {
  growth: number;
  people: number;
  resilience: number;
  brand: number;
  compliance: number;
}

export type FocusAction =
  | "expand_market"
  | "improve_efficiency"
  | "invest_people"
  | "risk_mitigation"
  | "brand_campaign";

export type RiskPosture = "conservative" | "balanced" | "aggressive";

export interface DecisionPayload {
  budget_split: DecisionBudgetSplit;
  focus_action: FocusAction;
  risk_posture: RiskPosture;
  notes?: string;
}

export interface DecisionRecord {
  id: string;
  session_id: string;
  round_id: string;
  player_id: string;
  company_id: string;
  payload: DecisionPayload;
  created_at: string;
}

export type InteractionType =
  | "trade_contract"
  | "joint_venture"
  | "price_war"
  | "talent_poach"
  | "reputation_challenge";

export type InteractionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "countered"
  | "expired";

export interface InteractionTerms {
  intensity: number;
  cash_amount?: number;
  duration_rounds?: number;
  message?: string;
}

export interface InteractionProposal {
  id: string;
  session_id: string;
  round_id: string;
  proposer_company_id: string;
  target_company_id: string;
  type: InteractionType;
  terms: InteractionTerms;
  status: InteractionStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface InteractionResponse {
  id: string;
  proposal_id: string;
  responder_company_id: string;
  response: "accept" | "reject" | "counter";
  counter_terms?: InteractionTerms;
  created_at: string;
}

export interface ScoreBreakdown {
  company_id: string;
  dimension_scores: {
    financial: number;
    market_position: number;
    people: number;
    risk_and_robustness: number;
    reputation: number;
  };
  total_score: number;
  rank: number;
}

export interface ScoreSnapshot {
  id: string;
  session_id: string;
  round_id: string;
  company_id: string;
  breakdown: ScoreBreakdown;
  created_at: string;
}

export interface CompanyMetricSnapshot {
  id: string;
  session_id: string;
  round_id: string;
  round_number: number;
  company_id: string;
  metrics: CompanyMetrics;
  total_score: number;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  session_id: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface TimelineEntry {
  round_number: number;
  event: Pick<EventCard, "category" | "severity" | "title" | "narrative">;
  decisions: Array<{
    company_id: string;
    focus_action: FocusAction;
    risk_posture: RiskPosture;
  }>;
  interactions: Array<{
    type: InteractionType;
    proposer_company_id: string;
    target_company_id: string;
    status: InteractionStatus;
  }>;
  leaderboard: ScoreBreakdown[];
}

export interface RoundResolution {
  round_id: string;
  round_number: number;
  event: EventCard;
  metric_deltas: Record<string, Partial<CompanyMetrics>>;
  explanations: string[];
  new_risks: string[];
}

export interface CompanyRoundSeriesPoint {
  round_number: number;
  total_score: number;
  metrics: CompanyMetrics;
  created_at: string;
}

export interface CompanyPerformanceSeries {
  company_id: string;
  company_name: string;
  history_start_round: number | null;
  points: CompanyRoundSeriesPoint[];
}

export type MessageDirection = "inbox" | "outbox" | "neutral";

export interface MessageCenterItem {
  proposal_id: string;
  session_id: string;
  round_id: string;
  round_number: number | null;
  proposer_company_id: string;
  proposer_company_name: string;
  target_company_id: string;
  target_company_name: string;
  type: InteractionType;
  terms: InteractionTerms;
  status: InteractionStatus;
  direction: MessageDirection;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface MessageCenterFeed {
  session_id: string;
  total: number;
  scope: {
    company_id?: string;
    direction: "inbox" | "outbox" | "all";
    status?: InteractionStatus;
    limit: number;
  };
  counts: Record<InteractionStatus, number>;
  messages: MessageCenterItem[];
}

export interface SessionState {
  session: Session;
  players: Player[];
  companies: Company[];
  rounds: Round[];
  current_round: Round | null;
  current_event: RoundEvent | null;
  decisions_submitted: number;
  pending_interactions: InteractionProposal[];
  timeline: TimelineEntry[];
}

export interface SessionResults {
  session_id: string;
  leaderboard: ScoreBreakdown[];
  decision_timeline: TimelineEntry[];
  performance_series: CompanyPerformanceSeries[];
}
