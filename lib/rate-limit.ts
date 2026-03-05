import { Redis } from "@upstash/redis";

interface RateLimitOptions {
  scope: string;
  maxRequests: number;
  windowMs: number;
  keySuffix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;
let redisClient: Redis | null | undefined;

export async function checkRateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const identifier = buildIdentifier(request, options.scope, options.keySuffix);
  const redis = getRedisClient();

  if (redis) {
    try {
      return await checkRedisRateLimit(redis, identifier, options, now);
    } catch {
      // Fall back to in-memory limiter if Redis is temporarily unavailable.
    }
  }

  return checkInMemoryRateLimit(identifier, options, now);
}

function checkInMemoryRateLimit(
  identifier: string,
  options: RateLimitOptions,
  now: number
): RateLimitResult {
  sweepExpiredBuckets(now);

  const existing = buckets.get(identifier);

  if (!existing || existing.resetAt <= now) {
    buckets.set(identifier, {
      count: 1,
      resetAt: now + options.windowMs
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(options.maxRequests - 1, 0)
    };
  }

  if (existing.count >= options.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
      remaining: 0
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(options.maxRequests - existing.count, 0)
  };
}

async function checkRedisRateLimit(
  redis: Redis,
  identifier: string,
  options: RateLimitOptions,
  now: number
): Promise<RateLimitResult> {
  const windowIndex = Math.floor(now / options.windowMs);
  const key = `ratelimit:${identifier}:${windowIndex}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, options.windowMs + 1000);
  }

  const windowEnd = (windowIndex + 1) * options.windowMs;

  if (count > options.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil((windowEnd - now) / 1000), 1),
      remaining: 0
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(options.maxRequests - count, 0)
  };
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({
    url,
    token
  });

  return redisClient;
}

function buildIdentifier(request: Request, scope: string, keySuffix?: string): string {
  const ip = getClientIp(request);
  const suffix = keySuffix ? `:${keySuffix}` : "";
  return `${scope}:${ip}${suffix}`;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function sweepExpiredBuckets(now: number): void {
  if (now - lastSweepAt < 60_000) {
    return;
  }

  lastSweepAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
