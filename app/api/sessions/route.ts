import { ok, fail, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { createSessionSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const limit = await checkRateLimit(request, {
      scope: "session-create",
      maxRequests: 20,
      windowMs: 10 * 60 * 1000
    });
    if (!limit.allowed) {
      return fail(`Too many session create requests. Retry in ${limit.retryAfterSeconds}s`, 429);
    }

    const payload = await parseBody(request, createSessionSchema);
    const store = getRuntimeGameStore();
    const created = await store.createSession(payload);
    return ok(created, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create session";
    return fail(message, 400);
  }
}

export async function GET(): Promise<Response> {
  const store = getRuntimeGameStore();
  const sessions = await store.listSessions();
  return ok({ sessions });
}
