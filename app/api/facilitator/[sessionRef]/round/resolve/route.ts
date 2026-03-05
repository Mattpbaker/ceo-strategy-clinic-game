import { ok, fail } from "@/lib/api";
import { ensureFacilitatorAuthorized } from "@/lib/facilitator-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";

interface Params {
  params: Promise<{ sessionRef: string }>;
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { sessionRef } = await params;
    const tokenPrefix = request.headers.get("x-facilitator-token")?.slice(0, 12) ?? "missing";
    const limit = await checkRateLimit(request, {
      scope: "facilitator-resolve",
      keySuffix: `${sessionRef.toUpperCase()}:${tokenPrefix}`,
      maxRequests: 60,
      windowMs: 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Too many round resolve requests. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const auth = await ensureFacilitatorAuthorized(request, sessionRef);
    if (!auth.ok) {
      return fail(auth.error, 401);
    }

    const store = getRuntimeGameStore();
    const outcome = await store.resolveCurrentRound(sessionRef);
    return ok(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve round";
    return fail(message, 400);
  }
}
