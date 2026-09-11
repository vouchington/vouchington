import { RateLimiter } from '@data-stores/valkey-rate-limiter'

// 3 requests per minute per identity (API key or anon IP) + per IP (threshold=4 means the 4th request is rejected)
const rssRateLimiter = new RateLimiter({ prefix: 'rss', ttlSeconds: 60 })
const RSS_RATE_LIMIT_THRESHOLD = 4

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export async function checkRssRateLimit(
  primaryId: string,
  ip: string | undefined,
  route: string,
): Promise<boolean> {
  // Skip secondary IP key when primaryId already encodes the IP (anon requests)
  const isAnonIpIdentity = typeof ip === 'string' && primaryId === `anon:${ip}`
  const includeIp = typeof ip === 'string' && !LOOPBACK_IPS.has(ip) && !isAnonIpIdentity
  const rateLimitIds = [`${primaryId}:${route}`, includeIp ? `ip:${ip}:${route}` : ''].filter(
    Boolean,
  )
  const { limited } = await rssRateLimiter.addAndCheck(rateLimitIds, RSS_RATE_LIMIT_THRESHOLD)
  return limited
}
