import { ok, fail } from "@/lib/api";
import { getRuntimeGameStore } from "@/lib/store-runtime";

interface Params {
  params: Promise<{ sessionRef: string }>;
}

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { sessionRef } = await params;
    const store = getRuntimeGameStore();
    const state = await store.getSessionState(sessionRef);
    return ok(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch session state";
    return fail(message, 404);
  }
}
