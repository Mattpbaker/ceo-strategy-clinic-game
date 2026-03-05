import { ok, fail, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { decisionPayloadSchema } from "@/lib/validation";

interface Params {
  params: Promise<{ roundId: string }>;
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { roundId } = await params;
    const limit = await checkRateLimit(request, {
      scope: "round-decision",
      keySuffix: roundId,
      maxRequests: 300,
      windowMs: 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Decision rate limit exceeded. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const payload = await parseBody(request, decisionPayloadSchema);

    const store = getRuntimeGameStore();
    const decision = await store.submitDecision(roundId, payload.player_id, {
      budget_split: payload.budget_split,
      focus_action: payload.focus_action,
      risk_posture: payload.risk_posture,
      notes: payload.notes
    });

    return ok({ decision }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit decision";
    return fail(message, 400);
  }
}
