/**
 * Rate Limiting Utility
 *
 * Uses Upstash Redis for distributed rate limiting across Vercel serverless functions.
 * If Upstash is not configured, falls back to in-memory rate limiting (less reliable).
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory fallback for development
const inMemoryLimits = new Map();

/**
 * Get rate limiter instance
 */
function getRateLimiter() {
  // Check if Upstash Redis is configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // 10 requests per 10 seconds per IP
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '10 s'),
      analytics: true,
      prefix: 'ratelimit:workshop',
    });
  }

  // Fallback to in-memory (not recommended for production)
  return null;
}

const ratelimit = getRateLimiter();

/**
 * In-memory rate limiter fallback
 */
function inMemoryRateLimit(identifier, limit = 10, windowSeconds = 10) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  if (!inMemoryLimits.has(identifier)) {
    inMemoryLimits.set(identifier, []);
  }

  const requests = inMemoryLimits.get(identifier);

  // Remove old requests outside the window
  const validRequests = requests.filter(time => now - time < windowMs);

  if (validRequests.length >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset: new Date(validRequests[0] + windowMs),
    };
  }

  validRequests.push(now);
  inMemoryLimits.set(identifier, validRequests);

  return {
    success: true,
    limit,
    remaining: limit - validRequests.length,
    reset: new Date(now + windowMs),
  };
}

/**
 * Apply rate limiting to a request
 *
 * @param {Request} req - The request object
 * @param {Response} res - The response object
 * @param {string} identifier - Unique identifier (usually IP address)
 * @returns {Promise<boolean>} - Returns true if request is allowed, false if rate limited
 */
export async function applyRateLimit(req, res, identifier = null) {
  // Get identifier from IP address if not provided
  const id = identifier || getClientIdentifier(req);

  let result;

  if (ratelimit) {
    // Use Upstash Redis rate limiter
    result = await ratelimit.limit(id);
  } else {
    // Use in-memory fallback
    console.warn('⚠️  Using in-memory rate limiting. Configure Upstash Redis for production.');
    result = inMemoryRateLimit(id);
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.reset);

  if (!result.success) {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    });
    return false;
  }

  return true;
}

/**
 * Get client identifier from request (IP address)
 */
function getClientIdentifier(req) {
  // Vercel provides x-forwarded-for header
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() :
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             'unknown';

  return ip;
}

/**
 * Middleware-style rate limiter
 */
export async function rateLimitMiddleware(req, res, next) {
  const allowed = await applyRateLimit(req, res);
  if (allowed && next) {
    next();
  }
  return allowed;
}
