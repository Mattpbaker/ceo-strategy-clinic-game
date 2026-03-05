import { getGameStore } from "@/lib/store";
import {
  generateFacilitatorToken,
  hashFacilitatorToken,
  verifyFacilitatorToken as verifyHashedFacilitatorToken
} from "@/lib/facilitator-auth";
import { getSupabaseGameStore, isSupabaseConfigured } from "@/lib/store-supabase";
import {
  CompanyPerformanceSeries,
  DecisionPayload,
  DecisionRecord,
  InteractionProposal,
  InteractionStatus,
  MessageCenterFeed,
  Session,
  SessionResults,
  SessionState
} from "@/lib/types";

export interface RuntimeGameStore {
  createSession(input?: {
    facilitator_name?: string;
    total_rounds?: number;
  }): Promise<{ session: Session; facilitator_token: string }>;
  listSessions(): Promise<Session[]>;
  joinSession(input: {
    session_ref: string;
    nickname: string;
  }): Promise<{ session: Session; player: SessionState["players"][number]; company: SessionState["companies"][number] }>;
  controlSession(
    sessionRef: string,
    action: "start" | "pause" | "resume" | "advance_to_interaction"
  ): Promise<Session>;
  submitDecision(roundId: string, playerId: string, payload: DecisionPayload): Promise<DecisionRecord>;
  proposeInteraction(input: {
    session_id: string;
    round_id: string;
    proposer_company_id: string;
    target_company_id: string;
    type: InteractionProposal["type"];
    terms: InteractionProposal["terms"];
    expires_in_minutes?: number;
  }): Promise<InteractionProposal>;
  respondInteraction(input: {
    proposal_id: string;
    responder_company_id: string;
    response: "accept" | "reject" | "counter";
    counter_terms?: InteractionProposal["terms"];
  }): Promise<InteractionProposal>;
  injectFacilitatorEvent(
    sessionRef: string,
    input: {
      category: "economic" | "social" | "political";
      severity: "low" | "medium" | "high";
      title: string;
      narrative: string;
      effects: Partial<Record<keyof SessionState["companies"][number]["metrics"], number>>;
    }
  ): Promise<SessionState["current_event"] extends infer T ? Exclude<T, null> : never>;
  resolveCurrentRound(sessionRef: string): Promise<{
    resolution: unknown;
    leaderboard: SessionResults["leaderboard"];
    session: Session;
  }>;
  verifyFacilitatorToken(sessionRef: string, token: string): Promise<boolean>;
  listInteractionMessages(
    sessionRef: string,
    options?: {
      company_id?: string;
      direction?: "inbox" | "outbox" | "all";
      status?: InteractionStatus;
      limit?: number;
    }
  ): Promise<MessageCenterFeed>;
  getPerformanceSeries(sessionRef: string): Promise<CompanyPerformanceSeries[]>;
  getSessionState(sessionRef: string): Promise<SessionState>;
  getResults(sessionRef: string): Promise<SessionResults>;
}

class InMemoryAsyncStoreAdapter implements RuntimeGameStore {
  private facilitatorTokenHashes = new Map<string, string>();
  private facilitatorCodeHashes = new Map<string, string>();

  async createSession(input?: {
    facilitator_name?: string;
    total_rounds?: number;
  }): Promise<{ session: Session; facilitator_token: string }> {
    const session = getGameStore().createSession(input);
    const facilitatorToken = generateFacilitatorToken();
    const tokenHash = hashFacilitatorToken(facilitatorToken);

    this.facilitatorTokenHashes.set(session.id, tokenHash);
    this.facilitatorCodeHashes.set(session.code.toUpperCase(), tokenHash);

    return {
      session,
      facilitator_token: facilitatorToken
    };
  }

  async listSessions(): Promise<Session[]> {
    return getGameStore().getTables().sessions;
  }

  async joinSession(input: {
    session_ref: string;
    nickname: string;
  }): Promise<{ session: Session; player: SessionState["players"][number]; company: SessionState["companies"][number] }> {
    return getGameStore().joinSession(input);
  }

  async controlSession(
    sessionRef: string,
    action: "start" | "pause" | "resume" | "advance_to_interaction"
  ): Promise<Session> {
    return getGameStore().controlSession(sessionRef, action);
  }

  async submitDecision(roundId: string, playerId: string, payload: DecisionPayload): Promise<DecisionRecord> {
    return getGameStore().submitDecision(roundId, playerId, payload);
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
    return getGameStore().proposeInteraction(input);
  }

  async respondInteraction(input: {
    proposal_id: string;
    responder_company_id: string;
    response: "accept" | "reject" | "counter";
    counter_terms?: InteractionProposal["terms"];
  }): Promise<InteractionProposal> {
    return getGameStore().respondInteraction(input);
  }

  async injectFacilitatorEvent(
    sessionRef: string,
    input: {
      category: "economic" | "social" | "political";
      severity: "low" | "medium" | "high";
      title: string;
      narrative: string;
      effects: Partial<Record<keyof SessionState["companies"][number]["metrics"], number>>;
    }
  ): Promise<SessionState["current_event"] extends infer T ? Exclude<T, null> : never> {
    return getGameStore().injectFacilitatorEvent(sessionRef, input) as SessionState["current_event"] extends infer T
      ? Exclude<T, null>
      : never;
  }

  async resolveCurrentRound(sessionRef: string): Promise<{
    resolution: unknown;
    leaderboard: SessionResults["leaderboard"];
    session: Session;
  }> {
    const outcome = getGameStore().resolveCurrentRound(sessionRef);
    return {
      resolution: outcome.resolution,
      leaderboard: outcome.leaderboard,
      session: outcome.session
    };
  }

  async verifyFacilitatorToken(sessionRef: string, token: string): Promise<boolean> {
    const expected =
      this.facilitatorTokenHashes.get(sessionRef) ??
      this.facilitatorCodeHashes.get(sessionRef.toUpperCase());
    return verifyHashedFacilitatorToken(token, expected);
  }

  async listInteractionMessages(
    sessionRef: string,
    options?: {
      company_id?: string;
      direction?: "inbox" | "outbox" | "all";
      status?: InteractionStatus;
      limit?: number;
    }
  ): Promise<MessageCenterFeed> {
    return getGameStore().listInteractionMessages(sessionRef, options);
  }

  async getPerformanceSeries(sessionRef: string): Promise<CompanyPerformanceSeries[]> {
    return getGameStore().getPerformanceSeries(sessionRef);
  }

  async getSessionState(sessionRef: string): Promise<SessionState> {
    return getGameStore().getSessionState(sessionRef);
  }

  async getResults(sessionRef: string): Promise<SessionResults> {
    return getGameStore().getResults(sessionRef);
  }
}

const inMemoryAdapter = new InMemoryAsyncStoreAdapter();

export function getRuntimeGameStore(): RuntimeGameStore {
  if (isSupabaseConfigured()) {
    return getSupabaseGameStore();
  }
  return inMemoryAdapter;
}

export function isUsingSupabase(): boolean {
  return isSupabaseConfigured();
}
