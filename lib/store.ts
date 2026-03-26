import { TOTAL_ROUNDS, STARTING_METRICS } from "@/lib/constants";
import { createEventCard, drawEvent } from "@/lib/events";
import { resolveRound } from "@/lib/resolver";
import { scoreCompanies } from "@/lib/scoring";
import {
  AuditLogEntry,
  Company,
  CompanyMetricSnapshot,
  CompanyPerformanceSeries,
  DecisionPayload,
  DecisionRecord,
  EventCard,
  InteractionProposal,
  InteractionResponse,
  InteractionStatus,
  MessageCenterFeed,
  MessageDirection,
  Player,
  Round,
  RoundEvent,
  ScoreSnapshot,
  Session,
  SessionResults,
  SessionState,
  TimelineEntry
} from "@/lib/types";
import { createId, createSessionCode, nowIso } from "@/lib/utils";

interface CreateSessionInput {
  facilitator_name?: string;
  total_rounds?: number;
}

interface JoinSessionInput {
  session_ref: string;
  nickname: string;
}

interface ProposeInteractionInput {
  session_id: string;
  round_id: string;
  proposer_company_id: string;
  target_company_id: string;
  type: InteractionProposal["type"];
  terms: InteractionProposal["terms"];
  expires_in_minutes?: number;
}

interface RespondInteractionInput {
  proposal_id: string;
  responder_company_id: string;
  response: "accept" | "reject" | "counter";
  counter_terms?: InteractionProposal["terms"];
}

interface FacilitatorEventInput {
  category: EventCard["category"];
  severity: EventCard["severity"];
  title: string;
  narrative: string;
  effects: EventCard["effects"];
}

interface InMemoryTables {
  sessions: Session[];
  players: Player[];
  companies: Company[];
  rounds: Round[];
  event_cards: EventCard[];
  round_events: RoundEvent[];
  decisions: DecisionRecord[];
  interaction_proposals: InteractionProposal[];
  interaction_responses: InteractionResponse[];
  score_snapshots: ScoreSnapshot[];
  company_metric_snapshots: CompanyMetricSnapshot[];
  audit_log: AuditLogEntry[];
}

class InMemoryGameStore {
  private tables: InMemoryTables = {
    sessions: [],
    players: [],
    companies: [],
    rounds: [],
    event_cards: [],
    round_events: [],
    decisions: [],
    interaction_proposals: [],
    interaction_responses: [],
    score_snapshots: [],
    company_metric_snapshots: [],
    audit_log: []
  };

  private timeline = new Map<string, TimelineEntry[]>();
  private usedCodes = new Set<string>();

  createSession(input: CreateSessionInput = {}): Session {
    const timestamp = nowIso();
    const session: Session = {
      id: createId("ses"),
      code: this.generateUniqueCode(),
      facilitator_name: input.facilitator_name?.trim() || "Facilitator",
      status: "waiting",
      total_rounds: input.total_rounds ?? TOTAL_ROUNDS,
      current_round_number: 1,
      seed: createId("seed"),
      created_at: timestamp,
      updated_at: timestamp
    };

    this.tables.sessions.push(session);
    this.timeline.set(session.id, []);

    for (let roundNumber = 1; roundNumber <= session.total_rounds; roundNumber += 1) {
      this.tables.rounds.push({
        id: createId("rnd"),
        session_id: session.id,
        round_number: roundNumber,
        phase: "pending",
        started_at: null,
        resolved_at: null,
        created_at: timestamp
      });
    }

    this.writeAudit(session.id, "system", "session_created", {
      session_id: session.id,
      code: session.code,
      total_rounds: session.total_rounds
    });

    return session;
  }

  joinSession(input: JoinSessionInput): { session: Session; player: Player; company: Company } {
    const session = this.findSessionByRef(input.session_ref);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status === "completed") {
      throw new Error("Session is already completed");
    }

    const nickname = input.nickname.trim();
    if (!nickname) {
      throw new Error("Nickname is required");
    }

    const duplicate = this.tables.players.find(
      (player) => player.session_id === session.id && player.nickname.toLowerCase() === nickname.toLowerCase()
    );

    if (duplicate) {
      throw new Error("Nickname already taken in this session");
    }

    const timestamp = nowIso();

    const player: Player = {
      id: createId("ply"),
      session_id: session.id,
      nickname,
      role: "player",
      created_at: timestamp
    };

    const company: Company = {
      id: createId("com"),
      session_id: session.id,
      player_id: player.id,
      name: `${nickname} Ventures`,
      metrics: { ...STARTING_METRICS },
      created_at: timestamp,
      updated_at: timestamp
    };

    this.tables.players.push(player);
    this.tables.companies.push(company);

    this.rebalanceMarketShare(session.id);

    this.writeAudit(session.id, player.id, "player_joined", {
      player_id: player.id,
      company_id: company.id,
      nickname: player.nickname
    });

    return { session, player, company };
  }

  controlSession(sessionRef: string, action: "start" | "pause" | "resume" | "advance_to_interaction"): Session {
    const session = this.requireSession(sessionRef);

    if (action === "start") {
      if (session.status !== "waiting") {
        return session;
      }

      const playerCount = this.tables.players.filter((player) => player.session_id === session.id).length;
      if (playerCount === 0) {
        throw new Error("Cannot start session without players");
      }

      const firstRound = this.requireRoundByNumber(session.id, 1);
      firstRound.phase = "decision";
      firstRound.started_at = nowIso();
      session.status = "running";
      session.updated_at = nowIso();
    }

    if (action === "pause") {
      if (session.status === "running") {
        session.status = "paused";
        session.updated_at = nowIso();
      }
    }

    if (action === "resume") {
      if (session.status === "paused") {
        session.status = "running";
        session.updated_at = nowIso();
      }
    }

    if (action === "advance_to_interaction") {
      const currentRound = this.requireRoundByNumber(session.id, session.current_round_number);
      if (currentRound.phase === "decision") {
        currentRound.phase = "interaction";
        session.updated_at = nowIso();
      }
    }

    this.writeAudit(session.id, "facilitator", "session_control", { action });

    return session;
  }

  submitDecision(roundId: string, playerId: string, payload: DecisionPayload): DecisionRecord {
    const round = this.requireRound(roundId);
    const session = this.requireSession(round.session_id);

    if (session.status !== "running" && session.status !== "paused") {
      throw new Error("Session is not active");
    }

    if (round.phase !== "decision" && round.phase !== "interaction") {
      throw new Error("Round is not accepting decisions");
    }

    const company = this.requireCompanyByPlayer(session.id, playerId);

    const existingIndex = this.tables.decisions.findIndex(
      (record) => record.round_id === round.id && record.player_id === playerId
    );

    const record: DecisionRecord = {
      id: existingIndex >= 0 ? this.tables.decisions[existingIndex].id : createId("dec"),
      session_id: session.id,
      round_id: round.id,
      player_id: playerId,
      company_id: company.id,
      payload,
      created_at: nowIso()
    };

    if (existingIndex >= 0) {
      this.tables.decisions[existingIndex] = record;
    } else {
      this.tables.decisions.push(record);
    }

    this.writeAudit(session.id, playerId, "decision_submitted", {
      round_id: round.id,
      focus_action: payload.focus_action,
      risk_posture: payload.risk_posture
    });

    return record;
  }

  proposeInteraction(input: ProposeInteractionInput): InteractionProposal {
    const session = this.requireSession(input.session_id);
    const round = this.requireRound(input.round_id);

    if (session.status !== "running" && session.status !== "paused") {
      throw new Error("Session is not active");
    }

    if (round.phase !== "interaction" && round.phase !== "decision") {
      throw new Error("Round is not accepting interactions");
    }

    if (input.proposer_company_id === input.target_company_id) {
      throw new Error("Cannot target the same company");
    }

    const proposer = this.requireCompany(session.id, input.proposer_company_id);
    const target = this.requireCompany(session.id, input.target_company_id);

    const expiresIn = input.expires_in_minutes ?? 8;
    const expiresAt = new Date(Date.now() + expiresIn * 60_000).toISOString();

    const proposal: InteractionProposal = {
      id: createId("int"),
      session_id: session.id,
      round_id: round.id,
      proposer_company_id: proposer.id,
      target_company_id: target.id,
      type: input.type,
      terms: input.terms,
      status: "pending",
      expires_at: expiresAt,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    this.tables.interaction_proposals.push(proposal);
    this.writeAudit(session.id, proposer.player_id, "interaction_proposed", {
      proposal_id: proposal.id,
      type: proposal.type,
      target_company_id: target.id
    });

    return proposal;
  }

  respondInteraction(input: RespondInteractionInput): InteractionProposal {
    const proposal = this.tables.interaction_proposals.find((item) => item.id === input.proposal_id);
    if (!proposal) {
      throw new Error("Interaction proposal not found");
    }

    if (proposal.target_company_id !== input.responder_company_id) {
      throw new Error("Only the target company can respond to this proposal");
    }

    if (proposal.status !== "pending") {
      throw new Error("Proposal is no longer pending");
    }

    let status: InteractionStatus = "rejected";
    if (input.response === "accept") {
      status = "accepted";
    }
    if (input.response === "counter") {
      status = "countered";
    }

    proposal.status = status;
    proposal.updated_at = nowIso();

    const response: InteractionResponse = {
      id: createId("rsp"),
      proposal_id: proposal.id,
      responder_company_id: input.responder_company_id,
      response: input.response,
      counter_terms: input.counter_terms,
      created_at: nowIso()
    };

    this.tables.interaction_responses.push(response);

    if (input.response === "counter" && input.counter_terms) {
      const counterProposal: InteractionProposal = {
        id: createId("int"),
        session_id: proposal.session_id,
        round_id: proposal.round_id,
        proposer_company_id: proposal.target_company_id,
        target_company_id: proposal.proposer_company_id,
        type: proposal.type,
        terms: input.counter_terms,
        status: "pending",
        expires_at: proposal.expires_at,
        created_at: nowIso(),
        updated_at: nowIso()
      };
      this.tables.interaction_proposals.push(counterProposal);
    }

    this.writeAudit(proposal.session_id, input.responder_company_id, "interaction_responded", {
      proposal_id: proposal.id,
      response: input.response
    });

    return proposal;
  }

  injectFacilitatorEvent(sessionRef: string, input: FacilitatorEventInput): RoundEvent {
    const session = this.requireSession(sessionRef);

    const round = this.requireRoundByNumber(session.id, session.current_round_number);

    if (round.phase === "resolved") {
      throw new Error("Current round already resolved");
    }

    const event = createEventCard({
      category: input.category,
      severity: input.severity,
      title: input.title,
      narrative: input.narrative,
      effects: input.effects
    });

    this.tables.event_cards.push(event);

    const existing = this.tables.round_events.find((roundEvent) => roundEvent.round_id === round.id);
    if (existing) {
      throw new Error("Current round already has an assigned event");
    }

    const roundEvent: RoundEvent = {
      id: createId("rev"),
      session_id: session.id,
      round_id: round.id,
      event_card_id: event.id,
      event,
      source: "facilitator",
      created_at: nowIso()
    };

    this.tables.round_events.push(roundEvent);
    this.writeAudit(session.id, "facilitator", "facilitator_event_injected", {
      round_id: round.id,
      event_id: event.id,
      title: event.title
    });

    return roundEvent;
  }

  resolveCurrentRound(sessionRef: string): {
    resolution: ReturnType<typeof resolveRound>["resolution"];
    leaderboard: ReturnType<typeof scoreCompanies>;
    session: Session;
  } {
    const session = this.requireSession(sessionRef);

    if (session.status === "waiting") {
      throw new Error("Session has not started");
    }

    if (session.status === "completed") {
      throw new Error("Session is already completed");
    }

    const round = this.requireRoundByNumber(session.id, session.current_round_number);
    if (round.phase === "resolved") {
      throw new Error("Current round already resolved");
    }

    round.phase = "resolved";

    const companies = this.tables.companies.filter((company) => company.session_id === session.id);
    const decisions = this.tables.decisions.filter((decision) => decision.round_id === round.id);
    const interactions = this.tables.interaction_proposals.filter(
      (proposal) => proposal.round_id === round.id
    );

    let roundEvent = this.tables.round_events.find((entry) => entry.round_id === round.id);
    if (!roundEvent) {
      const eventCard = drawEvent(`${session.seed}:${round.round_number}`);
      this.tables.event_cards.push(eventCard);
      roundEvent = {
        id: createId("rev"),
        session_id: session.id,
        round_id: round.id,
        event_card_id: eventCard.id,
        event: eventCard,
        source: "deck",
        created_at: nowIso()
      };
      this.tables.round_events.push(roundEvent);
    }

    const resolved = resolveRound({
      session,
      round,
      companies,
      decisions,
      interactions,
      event: roundEvent.event
    });

    for (const updatedCompany of resolved.updatedCompanies) {
      const index = this.tables.companies.findIndex((company) => company.id === updatedCompany.id);
      if (index >= 0) {
        this.tables.companies[index] = updatedCompany;
      }
    }

    round.resolved_at = nowIso();

    this.expirePendingInteractions(round.id);

    const leaderboard = scoreCompanies(
      this.tables.companies.filter((company) => company.session_id === session.id)
    );

    for (const breakdown of leaderboard) {
      const snapshot: ScoreSnapshot = {
        id: createId("scr"),
        session_id: session.id,
        round_id: round.id,
        company_id: breakdown.company_id,
        breakdown,
        created_at: nowIso()
      };
      this.tables.score_snapshots.push(snapshot);
    }

    const scoreByCompanyId = new Map<string, number>();
    for (const breakdown of leaderboard) {
      scoreByCompanyId.set(breakdown.company_id, breakdown.total_score);
    }

    for (const company of resolved.updatedCompanies) {
      const metricSnapshot: CompanyMetricSnapshot = {
        id: createId("cms"),
        session_id: session.id,
        round_id: round.id,
        round_number: round.round_number,
        company_id: company.id,
        metrics: { ...company.metrics },
        total_score: scoreByCompanyId.get(company.id) ?? 0,
        created_at: nowIso()
      };
      this.tables.company_metric_snapshots.push(metricSnapshot);
    }

    this.appendTimeline(session.id, {
      round_number: round.round_number,
      event: {
        category: roundEvent.event.category,
        severity: roundEvent.event.severity,
        title: roundEvent.event.title,
        narrative: roundEvent.event.narrative
      },
      decisions: decisions.map((decision) => ({
        company_id: decision.company_id,
        focus_action: decision.payload.focus_action,
        risk_posture: decision.payload.risk_posture
      })),
      interactions: interactions.map((proposal) => ({
        type: proposal.type,
        proposer_company_id: proposal.proposer_company_id,
        target_company_id: proposal.target_company_id,
        status: proposal.status
      })),
      leaderboard
    });

    if (session.current_round_number >= session.total_rounds) {
      session.status = "completed";
    } else {
      session.current_round_number += 1;
      const nextRound = this.requireRoundByNumber(session.id, session.current_round_number);
      nextRound.phase = "decision";
      nextRound.started_at = nowIso();
      if (session.status === "paused") {
        session.status = "running";
      }
    }

    session.updated_at = nowIso();

    this.writeAudit(session.id, "system", "round_resolved", {
      round_id: round.id,
      round_number: round.round_number
    });

    return {
      resolution: resolved.resolution,
      leaderboard,
      session
    };
  }

  getSessionState(sessionRef: string): SessionState {
    const session = this.requireSession(sessionRef);
    const rounds = this.tables.rounds.filter((round) => round.session_id === session.id);
    const currentRound = rounds.find((round) => round.round_number === session.current_round_number) ?? null;
    const currentEvent = currentRound
      ? this.tables.round_events.find((event) => event.round_id === currentRound.id) ?? null
      : null;

    const pendingInteractions = currentRound
      ? this.tables.interaction_proposals.filter(
          (proposal) => proposal.round_id === currentRound.id && proposal.status === "pending"
        )
      : [];

    const decisionsSubmitted = currentRound
      ? this.tables.decisions.filter((decision) => decision.round_id === currentRound.id).length
      : 0;

    return {
      session,
      players: this.tables.players.filter((player) => player.session_id === session.id),
      companies: this.tables.companies.filter((company) => company.session_id === session.id),
      rounds,
      current_round: currentRound,
      current_event: currentEvent,
      decisions_submitted: decisionsSubmitted,
      pending_interactions: pendingInteractions,
      timeline: this.timeline.get(session.id) ?? []
    };
  }

  getResults(sessionRef: string): SessionResults {
    const session = this.requireSession(sessionRef);

    const leaderboard = scoreCompanies(
      this.tables.companies.filter((company) => company.session_id === session.id)
    );

    return {
      session_id: session.id,
      leaderboard,
      decision_timeline: this.timeline.get(session.id) ?? [],
      performance_series: this.getPerformanceSeries(sessionRef)
    };
  }

  listInteractionMessages(
    sessionRef: string,
    options: {
      company_id?: string;
      direction?: "inbox" | "outbox" | "all";
      status?: InteractionStatus;
      limit?: number;
    } = {}
  ): MessageCenterFeed {
    const session = this.requireSession(sessionRef);
    const direction = options.direction ?? "all";
    const limit = clampLimit(options.limit);
    const companyId = options.company_id;

    if (companyId) {
      this.requireCompany(session.id, companyId);
    }

    const companyById = new Map(
      this.tables.companies
        .filter((company) => company.session_id === session.id)
        .map((company) => [company.id, company])
    );

    const roundById = new Map(
      this.tables.rounds
        .filter((round) => round.session_id === session.id)
        .map((round) => [round.id, round])
    );

    const feed = this.tables.interaction_proposals
      .filter((proposal) => proposal.session_id === session.id)
      .filter((proposal) => !options.status || proposal.status === options.status)
      .map((proposal) => {
        const messageDirection = resolveDirection(proposal, companyId);
        if (direction !== "all" && messageDirection !== direction) {
          return null;
        }

        if (companyId && messageDirection === "neutral") {
          return null;
        }

        const proposer = companyById.get(proposal.proposer_company_id);
        const target = companyById.get(proposal.target_company_id);
        const round = roundById.get(proposal.round_id);

        return {
          proposal_id: proposal.id,
          session_id: proposal.session_id,
          round_id: proposal.round_id,
          round_number: round?.round_number ?? null,
          proposer_company_id: proposal.proposer_company_id,
          proposer_company_name: proposer?.name ?? proposal.proposer_company_id,
          target_company_id: proposal.target_company_id,
          target_company_name: target?.name ?? proposal.target_company_id,
          type: proposal.type,
          terms: proposal.terms,
          status: proposal.status,
          direction: messageDirection,
          expires_at: proposal.expires_at,
          created_at: proposal.created_at,
          updated_at: proposal.updated_at
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(compareMessagesNewestFirst);

    const counts = countInteractionStatuses(feed);

    return {
      session_id: session.id,
      total: feed.length,
      scope: {
        company_id: companyId,
        direction,
        status: options.status,
        limit
      },
      counts,
      messages: feed.slice(0, limit)
    };
  }

  getPerformanceSeries(sessionRef: string): CompanyPerformanceSeries[] {
    const session = this.requireSession(sessionRef);

    const companies = this.tables.companies
      .filter((company) => company.session_id === session.id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    const snapshots = this.tables.company_metric_snapshots
      .filter((snapshot) => snapshot.session_id === session.id)
      .sort((a, b) => {
        if (a.round_number !== b.round_number) {
          return a.round_number - b.round_number;
        }
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      });

    const snapshotsByCompany = new Map<string, CompanyMetricSnapshot[]>();
    for (const snapshot of snapshots) {
      const list = snapshotsByCompany.get(snapshot.company_id) ?? [];
      list.push(snapshot);
      snapshotsByCompany.set(snapshot.company_id, list);
    }

    return companies.map((company) => {
      const points = (snapshotsByCompany.get(company.id) ?? []).map((snapshot) => ({
        round_number: snapshot.round_number,
        total_score: snapshot.total_score,
        metrics: { ...snapshot.metrics },
        created_at: snapshot.created_at
      }));

      return {
        company_id: company.id,
        company_name: company.name,
        history_start_round: points[0]?.round_number ?? null,
        points
      };
    });
  }

  getTables(): InMemoryTables {
    return this.tables;
  }

  resetForTests(): void {
    this.tables = {
      sessions: [],
      players: [],
      companies: [],
      rounds: [],
      event_cards: [],
      round_events: [],
      decisions: [],
      interaction_proposals: [],
      interaction_responses: [],
      score_snapshots: [],
      company_metric_snapshots: [],
      audit_log: []
    };
    this.timeline.clear();
    this.usedCodes.clear();
  }

  private appendTimeline(sessionId: string, entry: TimelineEntry): void {
    const existing = this.timeline.get(sessionId) ?? [];
    existing.push(entry);
    this.timeline.set(sessionId, existing);
  }

  private expirePendingInteractions(roundId: string): void {
    const now = Date.now();
    for (const proposal of this.tables.interaction_proposals) {
      if (proposal.round_id !== roundId || proposal.status !== "pending") {
        continue;
      }
      if (Date.parse(proposal.expires_at) <= now) {
        proposal.status = "expired";
        proposal.updated_at = nowIso();
      }
    }
  }

  private requireSession(sessionRef: string): Session {
    const session = this.findSessionByRef(sessionRef);
    if (!session) {
      throw new Error("Session not found");
    }
    return session;
  }

  private findSessionByRef(sessionRef: string): Session | undefined {
    return this.tables.sessions.find(
      (session) => session.id === sessionRef || session.code.toUpperCase() === sessionRef.toUpperCase()
    );
  }

  private requireRound(roundId: string): Round {
    const round = this.tables.rounds.find((item) => item.id === roundId);
    if (!round) {
      throw new Error("Round not found");
    }
    return round;
  }

  private requireRoundByNumber(sessionId: string, roundNumber: number): Round {
    const round = this.tables.rounds.find(
      (item) => item.session_id === sessionId && item.round_number === roundNumber
    );
    if (!round) {
      throw new Error("Round not found");
    }
    return round;
  }

  private requireCompany(sessionId: string, companyId: string): Company {
    const company = this.tables.companies.find(
      (item) => item.id === companyId && item.session_id === sessionId
    );
    if (!company) {
      throw new Error("Company not found");
    }
    return company;
  }

  private requireCompanyByPlayer(sessionId: string, playerId: string): Company {
    const company = this.tables.companies.find(
      (item) => item.session_id === sessionId && item.player_id === playerId
    );
    if (!company) {
      throw new Error("Company not found for player");
    }
    return company;
  }

  private rebalanceMarketShare(sessionId: string): void {
    const companies = this.tables.companies.filter((company) => company.session_id === sessionId);
    if (companies.length === 0) {
      return;
    }

    const equalShare = Math.max(2, Math.floor(100 / companies.length));
    for (const company of companies) {
      company.metrics.market_share = equalShare;
      company.updated_at = nowIso();
    }
  }

  private generateUniqueCode(): string {
    let code = createSessionCode();
    while (this.usedCodes.has(code)) {
      code = createSessionCode();
    }
    this.usedCodes.add(code);
    return code;
  }

  private writeAudit(
    sessionId: string,
    actor: string,
    action: string,
    details: Record<string, unknown>
  ): void {
    this.tables.audit_log.push({
      id: createId("aud"),
      session_id: sessionId,
      actor,
      action,
      details,
      created_at: nowIso()
    });
  }
}

function resolveDirection(
  proposal: InteractionProposal,
  companyId?: string
): MessageDirection {
  if (!companyId) {
    return "neutral";
  }
  if (proposal.target_company_id === companyId) {
    return "inbox";
  }
  if (proposal.proposer_company_id === companyId) {
    return "outbox";
  }
  return "neutral";
}

function compareMessagesNewestFirst(
  a: MessageCenterFeed["messages"][number],
  b: MessageCenterFeed["messages"][number]
): number {
  const aUpdated = Date.parse(a.updated_at);
  const bUpdated = Date.parse(b.updated_at);
  const aCreated = Date.parse(a.created_at);
  const bCreated = Date.parse(b.created_at);

  const aStamp = Number.isNaN(aUpdated) ? aCreated : aUpdated;
  const bStamp = Number.isNaN(bUpdated) ? bCreated : bUpdated;
  return bStamp - aStamp;
}

function countInteractionStatuses(
  messages: MessageCenterFeed["messages"]
): MessageCenterFeed["counts"] {
  const counts: MessageCenterFeed["counts"] = {
    pending: 0,
    accepted: 0,
    rejected: 0,
    countered: 0,
    expired: 0
  };

  for (const message of messages) {
    counts[message.status] += 1;
  }

  return counts;
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return 200;
  }
  return Math.max(1, Math.min(limit, 500));
}

let singleton: InMemoryGameStore | null = null;

export function getGameStore(): InMemoryGameStore {
  if (!singleton) {
    singleton = new InMemoryGameStore();
  }
  return singleton;
}
