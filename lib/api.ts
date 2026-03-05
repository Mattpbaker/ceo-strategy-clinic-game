import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: message
    },
    { status }
  );
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}
