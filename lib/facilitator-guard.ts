import { getRuntimeGameStore } from "@/lib/store-runtime";

export async function ensureFacilitatorAuthorized(
  request: Request,
  sessionRef: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = request.headers.get("x-facilitator-token")?.trim();

  if (!token) {
    return { ok: false, error: "Missing facilitator token" };
  }

  const authorized = await getRuntimeGameStore().verifyFacilitatorToken(sessionRef, token);
  if (!authorized) {
    return { ok: false, error: "Invalid facilitator token" };
  }

  return { ok: true };
}
