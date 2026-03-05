import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { TOTAL_ROUNDS, STARTING_METRICS } from "@/lib/constants";
import { createEventCard, drawEvent } from "@/lib/events";
import { resolveRound } from "@/lib/resolver";
import { scoreCompanies } from "@/lib/scoring";
import {
  generateFacilitatorToken,
  hashFacilitatorToken,
  verifyFacilitatorToken as verifyHashedFacilitatorToken
} from "@/lib/facilitator-auth";
import {
  Company,
  CompanyMetrics,
  DecisionPayload,
  DecisionRecord,
  EventCard,
  InteractionProposal,
  InteractionResponse,
  Player,
  Round,
  RoundEvent,
  ScoreBreakdown,
  Session,
  SessionResults,
  SessionState,
  TimelineEntry
} from "@/lib/types";
import { createId, createSessionCode, nowIso } from "@/lib/utils";
import type { RuntimeGameStore } from "@/lib/store-runtime";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

let singleton: SupabaseGameStore | null = null;

export function getSupabaseGameStore(): SupabaseGameStore {
  if (!singleton) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment variables are not configured");
    }

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    singleton = new SupabaseGameStore(client);
  }

  return singleton;
}

class SupabaseGameStore implements RuntimeGameStore {
  constructor(private readonly client: SupabaseClient) {}

  async createSession(input?: {
    facilitator_name?: string;
    total_rounds?: number;
  }): Promise<{ session: Session; facilitator_token: string }> {
    const totalRounds = input?.total_rounds ?? TOTAL_ROUNDS;
    const facilitatorName = input?.facilitator_name?.trim() || "Facilitator";
    const facilitatorToken = generateFacilitatorToken();
    const facilitatorTokenHash = hashFacilitatorToken(facilitatorToken);

    let code = await this.generateUniqueCode();
    let created: Session | null = null;

    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const { data, error } = await this.client
        .from("sessions")
        .insert({
          code,
          facilitator_name: facilitatorName,
          status: "waiting",
          total_rounds: totalRounds,
          current_round_number: 1,
          seed: createId("seed"),
          facilitator_token_hash: facilitatorTokenHash
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          code = await this.generateUniqueCode();
          continue;
        }
        throw new Error(error.message);
      }

      created = this.mapSession(data);
    }

    if (!created) {
      throw new Error("Unable to create unique session code");
    }

    const rounds = Array.from({ length: created.total_rounds }, (_, index) => ({
      session_id: created.id,
      round_number: index + 1,
      phase: "pending"
    }));

    const { error: roundsError } = await this.client.from("rounds").insert(rounds);
    if (roundsError) {
      throw new Error(roundsError.message);
    }

    await this.writeAudit(created.id, "system", "session_created", {
      session_id: created.id,
      code: created.code,
      total_rounds: created.total_rounds
    });

    return {
      session: created,
      facilitator_token: facilitatorToken
    };
  }

  async listSessions(): Promise<Session[]> {
    const { data, error } = await this.client
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapSession(row));
  }

  async joinSession(input: {
    session_ref: string;
    nickname: string;
  }): Promise<{ session: Session; player: Player; company: Company }> {
    const session = await this.requireSession(input.session_ref);

    if (session.status === "completed") {
      throw new Error("Session is already completed");
    }

    const nickname = input.nickname.trim();
    if (!nickname) {
      throw new Error("Nickname is required");
    }

    const { data: existing, error: existingError } = await this.client
      .from("players")
      .select("id")
      .eq("session_id", session.id)
      .eq("nickname", nickname)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      throw new Error("Nickname already taken in this session");
    }

    const { data: insertedPlayer, error: playerError } = await this.client
      .from("players")
      .insert({
        session_id: session.id,
        nickname,
        role: "player"
      })
      .select("*")
      .single();

    if (playerError) {
      throw new Error(playerError.message);
    }

    const player = this.mapPlayer(insertedPlayer);

    const { data: insertedCompany, error: companyError } = await this.client
      .from("companies")
      .insert({
        session_id: session.id,
        player_id: player.id,
        name: `${nickname} Ventures`,
        metrics: STARTING_METRICS
      })
      .select("*")
      .single();

    if (companyError) {
      throw new Error(companyError.message);
    }

    await this.rebalanceMarketShare(session.id);

    const refreshedCompany = await this.requireCompany(insertedCompany.id, session.id);

    await this.writeAudit(session.id, player.id, "player_joined", {
      player_id: player.id,
      company_id: refreshedCompany.id,
      nickname: player.nickname
    });

    return {
      session,
      player,
      company: refreshedCompany
    };
  }

  async controlSession(
    sessionRef: string,
    action: "start" | "pause" | "resume" | "advance_to_interaction"
  ): Promise<Session> {
    const session = await this.requireSession(sessionRef);

    if (action === "start") {
      if (session.status !== "waiting") {
        return session;
      }

      const { count, error: playerCountError } = await this.client
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);

      if (playerCountError) {
        throw new Error(playerCountError.message);
      }

      if (!count) {
        throw new Error("Cannot start session without players");
      }

      const firstRound = await this.requireRoundByNumber(session.id, 1);
      await this.updateRound(firstRound.id, {
        phase: "decision",
        started_at: nowIso()
      });

      const updated = await this.updateSession(session.id, {
        status: "running",
        updated_at: nowIso()
      });

      await this.writeAudit(session.id, "facilitator", "session_control", { action });
      return updated;
    }

    if (action === "pause") {
      if (session.status === "running") {
        const updated = await this.updateSession(session.id, {
          status: "paused",
          updated_at: nowIso()
        });
        await this.writeAudit(session.id, "facilitator", "session_control", { action });
        return updated;
      }
      return session;
    }

    if (action === "resume") {
      if (session.status === "paused") {
        const updated = await this.updateSession(session.id, {
          status: "running",
          updated_at: nowIso()
        });
        await this.writeAudit(session.id, "facilitator", "session_control", { action });
        return updated;
      }
      return session;
    }

    if (action === "advance_to_interaction") {
      const currentRound = await this.requireRoundByNumber(session.id, session.current_round_number);
      if (currentRound.phase === "decision") {
        await this.updateRound(currentRound.id, {
          phase: "interaction"
        });
        const updated = await this.updateSession(session.id, {
          updated_at: nowIso()
        });
        await this.writeAudit(session.id, "facilitator", "session_control", { action });
        return updated;
      }
      return session;
    }

    return session;
  }

  async submitDecision(roundId: string, playerId: string, payload: DecisionPayload): Promise<DecisionRecord> {
    const round = await this.requireRound(roundId);
    const session = await this.requireSession(round.session_id);

    if (session.status !== "running" && session.status !== "paused") {
      throw new Error("Session is not active");
    }

    if (round.phase !== "decision" && round.phase !== "interaction") {
      throw new Error("Round is not accepting decisions");
    }

    const company = await this.requireCompanyByPlayer(session.id, playerId);

    const { data, error } = await this.client
      .from("decisions")
      .upsert(
        {
          session_id: session.id,
          round_id: round.id,
          player_id: playerId,
          company_id: company.id,
          payload
        },
        { onConflict: "round_id,player_id" }
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await this.writeAudit(session.id, playerId, "decision_submitted", {
      round_id: round.id,
      focus_action: payload.focus_action,
      risk_posture: payload.risk_posture
    });

    return this.mapDecision(data);
  }

  async proposeInteraction(input: {
    session_id: string;
    round_id: string;
    proposer_company_id: string;
    target_company_id: string;
    type: InteractionProposal["type"];
    terms: InteractionProposal["terms"];
    expires_in_minutes?: number;
  }): Promise<InteractionProposal> {
    const session = await this.requireSession(input.session_id);
    const round = await this.requireRound(input.round_id);

    if (session.status !== "running" && session.status !== "paused") {
      throw new Error("Session is not active");
    }

    if (round.phase !== "interaction" && round.phase !== "decision") {
      throw new Error("Round is not accepting interactions");
    }

    if (input.proposer_company_id === input.target_company_id) {
      throw new Error("Cannot target the same company");
    }

    await this.requireCompany(input.proposer_company_id, session.id);
    await this.requireCompany(input.target_company_id, session.id);

    const expiresIn = input.expires_in_minutes ?? 8;
    const expiresAt = new Date(Date.now() + expiresIn * 60_000).toISOString();

    const { data, error } = await this.client
      .from("interaction_proposals")
      .insert({
        session_id: input.session_id,
        round_id: input.round_id,
        proposer_company_id: input.proposer_company_id,
        target_company_id: input.target_company_id,
        type: input.type,
        terms: input.terms,
        status: "pending",
        expires_at: expiresAt,
        updated_at: nowIso()
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const created = this.mapInteraction(data);

    await this.writeAudit(session.id, input.proposer_company_id, "interaction_proposed", {
      proposal_id: created.id,
      type: created.type,
      target_company_id: created.target_company_id
    });

    return created;
  }

  async respondInteraction(input: {
    proposal_id: string;
    responder_company_id: string;
    response: "accept" | "reject" | "counter";
    counter_terms?: InteractionProposal["terms"];
  }): Promise<InteractionProposal> {
    const proposal = await this.requireInteractionProposal(input.proposal_id);

    if (proposal.target_company_id !== input.responder_company_id) {
      throw new Error("Only the target company can respond to this proposal");
    }

    if (proposal.status !== "pending") {
      throw new Error("Proposal is no longer pending");
    }

    const status =
      input.response === "accept"
        ? "accepted"
        : input.response === "counter"
          ? "countered"
          : "rejected";

    const { data: updatedRow, error: updateError } = await this.client
      .from("interaction_proposals")
      .update({
        status,
        updated_at: nowIso()
      })
      .eq("id", proposal.id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const { error: responseError } = await this.client.from("interaction_responses").insert({
      proposal_id: proposal.id,
      responder_company_id: input.responder_company_id,
      response: input.response,
      counter_terms: input.counter_terms ?? null
    });

    if (responseError) {
      throw new Error(responseError.message);
    }

    if (input.response === "counter" && input.counter_terms) {
      const { error: counterError } = await this.client.from("interaction_proposals").insert({
        session_id: proposal.session_id,
        round_id: proposal.round_id,
        proposer_company_id: proposal.target_company_id,
        target_company_id: proposal.proposer_company_id,
        type: proposal.type,
        terms: input.counter_terms,
        status: "pending",
        expires_at: proposal.expires_at,
        updated_at: nowIso()
      });

      if (counterError) {
        throw new Error(counterError.message);
      }
    }

    await this.writeAudit(proposal.session_id, input.responder_company_id, "interaction_responded", {
      proposal_id: proposal.id,
      response: input.response
    });

    return this.mapInteraction(updatedRow);
  }

  async injectFacilitatorEvent(
    sessionRef: string,
    input: {
      category: "economic" | "social" | "political";
      severity: "low" | "medium" | "high";
      title: string;
      narrative: string;
      effects: Partial<Record<keyof CompanyMetrics, number>>;
    }
  ): Promise<RoundEvent> {
    const session = await this.requireSession(sessionRef);
    const currentRound = await this.requireRoundByNumber(session.id, session.current_round_number);

    if (currentRound.phase === "resolved") {
      throw new Error("Current round already resolved");
    }

    const { count, error: facilitatorCountError } = await this.client
      .from("round_events")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("source", "facilitator");

    if (facilitatorCountError) {
      throw new Error(facilitatorCountError.message);
    }

    if ((count ?? 0) > 0) {
      throw new Error("Facilitator ad-hoc event already used in this session");
    }

    const { data: existing, error: existingError } = await this.client
      .from("round_events")
      .select("id")
      .eq("round_id", currentRound.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      throw new Error("Current round already has an assigned event");
    }

    const event = createEventCard({
      category: input.category,
      severity: input.severity,
      title: input.title,
      narrative: input.narrative,
      effects: input.effects
    });

    const { data: eventCardRow, error: eventCardError } = await this.client
      .from("event_cards")
      .insert({
        category: event.category,
        severity: event.severity,
        title: event.title,
        narrative: event.narrative,
        effects: event.effects
      })
      .select("*")
      .single();

    if (eventCardError) {
      throw new Error(eventCardError.message);
    }

    const mappedEvent = this.mapEventCard(eventCardRow);

    const { data: roundEventRow, error: roundEventError } = await this.client
      .from("round_events")
      .insert({
        session_id: session.id,
        round_id: currentRound.id,
        event_card_id: mappedEvent.id,
        source: "facilitator"
      })
      .select("*")
      .single();

    if (roundEventError) {
      throw new Error(roundEventError.message);
    }

    const roundEvent = this.mapRoundEvent(roundEventRow, mappedEvent);

    await this.writeAudit(session.id, "facilitator", "facilitator_event_injected", {
      round_id: currentRound.id,
      event_id: mappedEvent.id,
      title: mappedEvent.title
    });

    return roundEvent;
  }

  async resolveCurrentRound(sessionRef: string): Promise<{
    resolution: SessionState["timeline"][number] | unknown;
    leaderboard: ScoreBreakdown[];
    session: Session;
  }> {
    const session = await this.requireSession(sessionRef);

    if (session.status === "waiting") {
      throw new Error("Session has not started");
    }

    if (session.status === "completed") {
      throw new Error("Session is already completed");
    }

    const round = await this.requireRoundByNumber(session.id, session.current_round_number);

    if (round.phase === "resolved") {
      throw new Error("Current round already resolved");
    }

    await this.updateRound(round.id, {
      phase: "resolved"
    });

    const companies = await this.listCompanies(session.id);
    const decisions = await this.listDecisionsByRound(round.id);
    const interactions = await this.listInteractionsByRound(round.id);

    let roundEvent = await this.findRoundEvent(round.id);
    if (!roundEvent) {
      const eventCard = drawEvent(`${session.seed}:${round.round_number}`);
      const { data: eventCardRow, error: eventCardError } = await this.client
        .from("event_cards")
        .insert({
          category: eventCard.category,
          severity: eventCard.severity,
          title: eventCard.title,
          narrative: eventCard.narrative,
          effects: eventCard.effects
        })
        .select("*")
        .single();

      if (eventCardError) {
        throw new Error(eventCardError.message);
      }

      const mappedEvent = this.mapEventCard(eventCardRow);

      const { data: roundEventRow, error: roundEventError } = await this.client
        .from("round_events")
        .insert({
          session_id: session.id,
          round_id: round.id,
          event_card_id: mappedEvent.id,
          source: "deck"
        })
        .select("*")
        .single();

      if (roundEventError) {
        throw new Error(roundEventError.message);
      }

      roundEvent = this.mapRoundEvent(roundEventRow, mappedEvent);
    }

    const resolved = resolveRound({
      session,
      round,
      companies,
      decisions,
      interactions,
      event: roundEvent.event
    });

    for (const company of resolved.updatedCompanies) {
      const { error } = await this.client
        .from("companies")
        .update({
          metrics: company.metrics,
          updated_at: company.updated_at
        })
        .eq("id", company.id);
      if (error) {
        throw new Error(error.message);
      }
    }

    await this.updateRound(round.id, {
      phase: "resolved",
      resolved_at: nowIso()
    });

    const { error: expireError } = await this.client
      .from("interaction_proposals")
      .update({
        status: "expired",
        updated_at: nowIso()
      })
      .eq("round_id", round.id)
      .eq("status", "pending")
      .lte("expires_at", nowIso());

    if (expireError) {
      throw new Error(expireError.message);
    }

    const leaderboard = scoreCompanies(resolved.updatedCompanies);

    const scoreRows = leaderboard.map((entry) => ({
      session_id: session.id,
      round_id: round.id,
      company_id: entry.company_id,
      breakdown: entry
    }));

    if (scoreRows.length > 0) {
      const { error: scoreError } = await this.client.from("score_snapshots").insert(scoreRows);
      if (scoreError) {
        throw new Error(scoreError.message);
      }
    }

    let updatedSession: Session;
    if (session.current_round_number >= session.total_rounds) {
      updatedSession = await this.updateSession(session.id, {
        status: "completed",
        updated_at: nowIso()
      });
    } else {
      const nextRoundNumber = session.current_round_number + 1;
      await this.updateRoundByNumber(session.id, nextRoundNumber, {
        phase: "decision",
        started_at: nowIso()
      });

      updatedSession = await this.updateSession(session.id, {
        current_round_number: nextRoundNumber,
        status: session.status === "paused" ? "running" : session.status,
        updated_at: nowIso()
      });
    }

    await this.writeAudit(session.id, "system", "round_resolved", {
      round_id: round.id,
      round_number: round.round_number
    });

    return {
      resolution: resolved.resolution,
      leaderboard,
      session: updatedSession
    };
  }

  async verifyFacilitatorToken(sessionRef: string, token: string): Promise<boolean> {
    const row = await this.getSessionRowByRef(sessionRef, "id, facilitator_token_hash");
    if (!row) {
      return false;
    }

    return verifyHashedFacilitatorToken(token, row.facilitator_token_hash as string | null);
  }

  async getSessionState(sessionRef: string): Promise<SessionState> {
    const session = await this.requireSession(sessionRef);
    const rounds = await this.listRounds(session.id);
    const currentRound =
      rounds.find((round) => round.round_number === session.current_round_number) ?? null;

    let currentEvent: RoundEvent | null = null;

    if (currentRound) {
      currentEvent = await this.findRoundEvent(currentRound.id);
    }

    const decisionsSubmitted = currentRound
      ? await this.countDecisions(currentRound.id)
      : 0;

    const pendingInteractions = currentRound
      ? await this.listPendingInteractions(currentRound.id)
      : [];

    const timeline = await this.buildTimeline(session.id);

    return {
      session,
      players: await this.listPlayers(session.id),
      companies: await this.listCompanies(session.id),
      rounds,
      current_round: currentRound,
      current_event: currentEvent,
      decisions_submitted: decisionsSubmitted,
      pending_interactions: pendingInteractions,
      timeline
    };
  }

  async getResults(sessionRef: string): Promise<SessionResults> {
    const session = await this.requireSession(sessionRef);
    const companies = await this.listCompanies(session.id);
    const leaderboard = scoreCompanies(companies);
    const decisionTimeline = await this.buildTimeline(session.id);

    return {
      session_id: session.id,
      leaderboard,
      decision_timeline: decisionTimeline
    };
  }

  private async buildTimeline(sessionId: string): Promise<TimelineEntry[]> {
    const [rounds, roundEventsData, decisions, interactions, scoreSnapshots] = await Promise.all([
      this.listRounds(sessionId),
      this.client.from("round_events").select("*").eq("session_id", sessionId),
      this.client.from("decisions").select("*").eq("session_id", sessionId),
      this.client.from("interaction_proposals").select("*").eq("session_id", sessionId),
      this.client.from("score_snapshots").select("*").eq("session_id", sessionId)
    ]);

    if (roundEventsData.error) {
      throw new Error(roundEventsData.error.message);
    }
    if (decisions.error) {
      throw new Error(decisions.error.message);
    }
    if (interactions.error) {
      throw new Error(interactions.error.message);
    }
    if (scoreSnapshots.error) {
      throw new Error(scoreSnapshots.error.message);
    }

    const roundEvents = roundEventsData.data || [];
    const eventIds = [...new Set(roundEvents.map((entry: any) => entry.event_card_id))];

    let eventCardsById = new Map<string, EventCard>();
    if (eventIds.length > 0) {
      const { data: eventRows, error: eventError } = await this.client
        .from("event_cards")
        .select("*")
        .in("id", eventIds);

      if (eventError) {
        throw new Error(eventError.message);
      }

      eventCardsById = new Map((eventRows || []).map((row: any) => [row.id, this.mapEventCard(row)]));
    }

    const eventsByRoundId = new Map<string, RoundEvent>();
    for (const row of roundEvents) {
      const eventCard = eventCardsById.get(row.event_card_id);
      if (eventCard) {
        eventsByRoundId.set(row.round_id, this.mapRoundEvent(row, eventCard));
      }
    }

    const decisionsByRoundId = groupBy(decisions.data || [], "round_id");
    const interactionsByRoundId = groupBy(interactions.data || [], "round_id");
    const snapshotsByRoundId = groupBy(scoreSnapshots.data || [], "round_id");

    const timeline: TimelineEntry[] = [];

    for (const round of rounds) {
      const roundEvent = eventsByRoundId.get(round.id);
      if (!roundEvent || !round.resolved_at) {
        continue;
      }

      const roundDecisions = (decisionsByRoundId.get(round.id) || []).map((row: any) => {
        const payload = row.payload as DecisionPayload;
        return {
          company_id: row.company_id,
          focus_action: payload.focus_action,
          risk_posture: payload.risk_posture
        };
      });

      const roundInteractions = (interactionsByRoundId.get(round.id) || []).map((row: any) => {
        const proposal = this.mapInteraction(row);
        return {
          type: proposal.type,
          proposer_company_id: proposal.proposer_company_id,
          target_company_id: proposal.target_company_id,
          status: proposal.status
        };
      });

      const leaderboard = (snapshotsByRoundId.get(round.id) || [])
        .map((row: any) => row.breakdown as ScoreBreakdown)
        .sort((a: ScoreBreakdown, b: ScoreBreakdown) => a.rank - b.rank);

      timeline.push({
        round_number: round.round_number,
        event: {
          category: roundEvent.event.category,
          severity: roundEvent.event.severity,
          title: roundEvent.event.title,
          narrative: roundEvent.event.narrative
        },
        decisions: roundDecisions,
        interactions: roundInteractions,
        leaderboard
      });
    }

    return timeline;
  }

  private async requireSession(sessionRef: string): Promise<Session> {
    const row = await this.getSessionRowByRef(sessionRef, "*");
    if (!row) {
      throw new Error("Session not found");
    }

    return this.mapSession(row);
  }

  private async getSessionRowByRef(sessionRef: string, columns: string): Promise<any | null> {
    const { data, error } = isUuid(sessionRef)
      ? await this.client.from("sessions").select(columns).eq("id", sessionRef).maybeSingle()
      : await this.client
          .from("sessions")
          .select(columns)
          .eq("code", sessionRef.toUpperCase())
          .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  private async requireRound(roundId: string): Promise<Round> {
    const { data, error } = await this.client.from("rounds").select("*").eq("id", roundId).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Round not found");
    }

    return this.mapRound(data);
  }

  private async requireRoundByNumber(sessionId: string, roundNumber: number): Promise<Round> {
    const { data, error } = await this.client
      .from("rounds")
      .select("*")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Round not found");
    }

    return this.mapRound(data);
  }

  private async requireCompany(companyId: string, sessionId: string): Promise<Company> {
    const { data, error } = await this.client
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Company not found");
    }

    return this.mapCompany(data);
  }

  private async requireCompanyByPlayer(sessionId: string, playerId: string): Promise<Company> {
    const { data, error } = await this.client
      .from("companies")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Company not found for player");
    }

    return this.mapCompany(data);
  }

  private async requireInteractionProposal(proposalId: string): Promise<InteractionProposal> {
    const { data, error } = await this.client
      .from("interaction_proposals")
      .select("*")
      .eq("id", proposalId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Interaction proposal not found");
    }

    return this.mapInteraction(data);
  }

  private async listRounds(sessionId: string): Promise<Round[]> {
    const { data, error } = await this.client
      .from("rounds")
      .select("*")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapRound(row));
  }

  private async listPlayers(sessionId: string): Promise<Player[]> {
    const { data, error } = await this.client
      .from("players")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapPlayer(row));
  }

  private async listCompanies(sessionId: string): Promise<Company[]> {
    const { data, error } = await this.client
      .from("companies")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapCompany(row));
  }

  private async listDecisionsByRound(roundId: string): Promise<DecisionRecord[]> {
    const { data, error } = await this.client.from("decisions").select("*").eq("round_id", roundId);

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapDecision(row));
  }

  private async listInteractionsByRound(roundId: string): Promise<InteractionProposal[]> {
    const { data, error } = await this.client
      .from("interaction_proposals")
      .select("*")
      .eq("round_id", roundId);

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapInteraction(row));
  }

  private async listPendingInteractions(roundId: string): Promise<InteractionProposal[]> {
    const { data, error } = await this.client
      .from("interaction_proposals")
      .select("*")
      .eq("round_id", roundId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row) => this.mapInteraction(row));
  }

  private async countDecisions(roundId: string): Promise<number> {
    const { count, error } = await this.client
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", roundId);

    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }

  private async updateSession(sessionId: string, patch: Record<string, unknown>): Promise<Session> {
    const { data, error } = await this.client
      .from("sessions")
      .update(patch)
      .eq("id", sessionId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapSession(data);
  }

  private async updateRound(roundId: string, patch: Record<string, unknown>): Promise<Round> {
    const { data, error } = await this.client
      .from("rounds")
      .update(patch)
      .eq("id", roundId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapRound(data);
  }

  private async updateRoundByNumber(
    sessionId: string,
    roundNumber: number,
    patch: Record<string, unknown>
  ): Promise<Round> {
    const { data, error } = await this.client
      .from("rounds")
      .update(patch)
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapRound(data);
  }

  private async findRoundEvent(roundId: string): Promise<RoundEvent | null> {
    const { data, error } = await this.client
      .from("round_events")
      .select("*")
      .eq("round_id", roundId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    const { data: eventCard, error: eventCardError } = await this.client
      .from("event_cards")
      .select("*")
      .eq("id", data.event_card_id)
      .single();

    if (eventCardError) {
      throw new Error(eventCardError.message);
    }

    return this.mapRoundEvent(data, this.mapEventCard(eventCard));
  }

  private async rebalanceMarketShare(sessionId: string): Promise<void> {
    const companies = await this.listCompanies(sessionId);
    if (companies.length === 0) {
      return;
    }

    const equalShare = Math.max(2, Math.floor(100 / companies.length));

    for (const company of companies) {
      const nextMetrics = {
        ...company.metrics,
        market_share: equalShare
      };

      const { error } = await this.client
        .from("companies")
        .update({
          metrics: nextMetrics,
          updated_at: nowIso()
        })
        .eq("id", company.id);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = createSessionCode();
      const { data, error } = await this.client
        .from("sessions")
        .select("id")
        .eq("code", code)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return code;
      }
    }

    throw new Error("Unable to generate unique code");
  }

  private async writeAudit(
    sessionId: string,
    actor: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.client.from("audit_log").insert({
      session_id: sessionId,
      actor,
      action,
      details
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  private mapSession(row: any): Session {
    return {
      id: row.id,
      code: row.code,
      facilitator_name: row.facilitator_name,
      status: row.status,
      total_rounds: row.total_rounds,
      current_round_number: row.current_round_number,
      seed: row.seed,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapPlayer(row: any): Player {
    return {
      id: row.id,
      session_id: row.session_id,
      nickname: row.nickname,
      role: row.role,
      created_at: row.created_at
    };
  }

  private mapCompany(row: any): Company {
    return {
      id: row.id,
      session_id: row.session_id,
      player_id: row.player_id,
      name: row.name,
      metrics: row.metrics as CompanyMetrics,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapRound(row: any): Round {
    return {
      id: row.id,
      session_id: row.session_id,
      round_number: row.round_number,
      phase: row.phase,
      started_at: row.started_at,
      resolved_at: row.resolved_at,
      created_at: row.created_at
    };
  }

  private mapEventCard(row: any): EventCard {
    return {
      id: row.id,
      category: row.category,
      severity: row.severity,
      title: row.title,
      narrative: row.narrative,
      effects: row.effects,
      created_at: row.created_at
    };
  }

  private mapRoundEvent(row: any, event: EventCard): RoundEvent {
    return {
      id: row.id,
      session_id: row.session_id,
      round_id: row.round_id,
      event_card_id: row.event_card_id,
      event,
      source: row.source,
      created_at: row.created_at
    };
  }

  private mapDecision(row: any): DecisionRecord {
    return {
      id: row.id,
      session_id: row.session_id,
      round_id: row.round_id,
      player_id: row.player_id,
      company_id: row.company_id,
      payload: row.payload as DecisionPayload,
      created_at: row.created_at
    };
  }

  private mapInteraction(row: any): InteractionProposal {
    return {
      id: row.id,
      session_id: row.session_id,
      round_id: row.round_id,
      proposer_company_id: row.proposer_company_id,
      target_company_id: row.target_company_id,
      type: row.type,
      terms: row.terms,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapInteractionResponse(row: any): InteractionResponse {
    return {
      id: row.id,
      proposal_id: row.proposal_id,
      responder_company_id: row.responder_company_id,
      response: row.response,
      counter_terms: row.counter_terms,
      created_at: row.created_at
    };
  }
}

function groupBy<T extends Record<string, any>>(rows: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = String(row[key]);
    const list = map.get(groupKey) ?? [];
    list.push(row);
    map.set(groupKey, list);
  }
  return map;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export { SupabaseGameStore };
