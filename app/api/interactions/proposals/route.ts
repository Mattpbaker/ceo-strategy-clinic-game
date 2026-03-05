import { ok, fail, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { interactionProposalSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const limit = await checkRateLimit(request, {
      scope: "interaction-proposal",
      maxRequests: 240,
      windowMs: 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Interaction proposal rate limit exceeded. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const payload = await parseBody(request, interactionProposalSchema);
    const store = getRuntimeGameStore();
    const proposal = await store.proposeInteraction(payload);
    return ok({ proposal }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create interaction proposal";
    return fail(message, 400);
  }
}
