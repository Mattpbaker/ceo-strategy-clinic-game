import { fail, ok } from "@/lib/api";
import { ensureFacilitatorAuthorized } from "@/lib/facilitator-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeGameStore } from "@/lib/store-runtime";
import { messageFeedQuerySchema } from "@/lib/validation";

interface Params {
  params: Promise<{ sessionRef: string }>;
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { sessionRef } = await params;
    const url = new URL(request.url);
    const query = messageFeedQuerySchema.safeParse({
      company_id: normalizeParam(url.searchParams.get("company_id")),
      direction: normalizeParam(url.searchParams.get("direction")),
      status: normalizeParam(url.searchParams.get("status")),
      limit: normalizeParam(url.searchParams.get("limit"))
    });

    if (!query.success) {
      const issue = query.error.issues[0];
      const path = issue?.path.join(".") || "query";
      return fail(`${path}: ${issue?.message || "Invalid query parameters"}`, 400);
    }

    const token = request.headers.get("x-facilitator-token")?.trim();
    const companyScope = query.data.company_id ?? "none";
    const tokenScope = token ? token.slice(0, 12) : "public";
    const limitCheck = await checkRateLimit(request, {
      scope: "message-feed",
      keySuffix: `${sessionRef.toUpperCase()}:${companyScope}:${tokenScope}`,
      maxRequests: 600,
      windowMs: 60 * 1000
    });

    if (!limitCheck.allowed) {
      return fail(`Message feed rate limit exceeded. Retry in ${limitCheck.retryAfterSeconds}s`, 429);
    }

    if (!token && !query.data.company_id) {
      return fail("company_id is required when facilitator token is not provided", 400);
    }

    if (token) {
      const auth = await ensureFacilitatorAuthorized(request, sessionRef);
      if (!auth.ok) {
        return fail(auth.error, 401);
      }
    }

    const feed = await getRuntimeGameStore().listInteractionMessages(sessionRef, query.data);
    return ok(feed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch messages";
    const status = message === "Session not found" ? 404 : 400;
    return fail(message, status);
  }
}

function normalizeParam(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
