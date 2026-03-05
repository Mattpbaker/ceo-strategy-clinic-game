import { ok, fail, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { joinSessionSchema } from "@/lib/validation";

interface Params {
  params: Promise<{ sessionRef: string }>;
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { sessionRef } = await params;
    const limit = await checkRateLimit(request, {
      scope: "session-join",
      keySuffix: sessionRef.toUpperCase(),
      maxRequests: 180,
      windowMs: 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Too many join attempts. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const payload = await parseBody(request, joinSessionSchema);
    const store = getRuntimeGameStore();
    const joined = await store.joinSession({
      session_ref: sessionRef,
      nickname: payload.nickname
    });

    return ok(joined, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join session";
    return fail(message, 400);
  }
}
