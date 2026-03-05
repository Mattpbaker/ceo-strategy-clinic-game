import { ok, fail, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { interactionResponseSchema } from "@/lib/validation";

interface Params {
  params: Promise<{ proposalId: string }>;
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { proposalId } = await params;
    const limit = await checkRateLimit(request, {
      scope: "interaction-respond",
      keySuffix: proposalId,
      maxRequests: 240,
      windowMs: 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Interaction response rate limit exceeded. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const payload = await parseBody(request, interactionResponseSchema);
    const store = getRuntimeGameStore();
    const proposal = await store.respondInteraction({
      proposal_id: proposalId,
      responder_company_id: payload.responder_company_id,
      response: payload.response,
      counter_terms: payload.counter_terms
    });

    return ok({ proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to respond to interaction proposal";
    return fail(message, 400);
  }
}
