import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateFacilitatorToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashFacilitatorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyFacilitatorToken(token: string, expectedHash: string | null | undefined): boolean {
  if (!token || !expectedHash) {
    return false;
  }

  const providedHash = hashFacilitatorToken(token);
  const expectedBuffer = Buffer.from(expectedHash, "utf8");
  const providedBuffer = Buffer.from(providedHash, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
