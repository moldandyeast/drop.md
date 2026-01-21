/**
 * Simple in-memory rate limiter for document creation
 * 
 * In production, you'd use Cloudflare Rate Limiting rules,
 * but this provides an additional layer of protection.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (per-isolate, so this is best-effort)
const store = new Map<string, RateLimitEntry>();

// Config
const MAX_REQUESTS = 10; // Max docs per window
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if a request should be rate limited
 * @returns true if the request should be allowed
 */
export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }
  
  let entry = store.get(ip);
  
  // No entry or expired entry
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + WINDOW_MS,
    };
    store.set(ip, entry);
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: entry.resetAt };
  }
  
  // Check limit
  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  // Increment and allow
  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: { remaining: number; resetAt: number }): Record<string, string> {
  return {
    'X-RateLimit-Limit': MAX_REQUESTS.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };
}
