import { ok, fail, parseBody } from "@/lib/api";
import { ensureFacilitatorAuthorized } from "@/lib/facilitator-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { facilitatorControlSchema } from "@/lib/validation";

interface Params {
  params: Promise<{ sessionRef: string }>;
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { sessionRef } = await params;
    const tokenPrefix = request.headers.get("x-facilitator-token")?.slice(0, 12) ?? "missing";
    const limit = await checkRateLimit(request, {
      scope: "facilitator-control",
      keySuffix: `${sessionRef.toUpperCase()}:${tokenPrefix}`,
      maxRequests: 120,
      windowMs: 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Too many facilitator control requests. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const auth = await ensureFacilitatorAuthorized(request, sessionRef);
    if (!auth.ok) {
      return fail(auth.error, 401);
    }

    const payload = await parseBody(request, facilitatorControlSchema);

    const store = getRuntimeGameStore();
    const session = await store.controlSession(sessionRef, payload.action);

    return ok({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to control session";
    return fail(message, 400);
  }
}
