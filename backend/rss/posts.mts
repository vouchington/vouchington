import app from '@voucha/api/app'
import type { Context } from '@jongleberry/api-server'
import { validateApiKey } from '@services/api-keys/validate'
import { buildPostsRssFeed } from '@services/rss-xml/posts-feed'
import { checkRssRateLimit } from '@services/rss-xml/rate-limiter'

app.route('/rss/posts').get(async (ctx: Context) => {
  const apikey = ctx.query.apikey as string | undefined
  let rateLimitId: string

  if (apikey) {
    const { valid, apiKey } = await validateApiKey(apikey, 'rss-feeds:read')
    if (!valid || !apiKey) ctx.throw(403, 'Invalid API key or insufficient permissions')
    rateLimitId = `key:${apiKey.id}`
  } else {
    if (!ctx.ip) ctx.throw(400, 'IP address required for anonymous access')
    rateLimitId = `anon:${ctx.ip}`
  }

  const limited = await checkRssRateLimit(rateLimitId, ctx.ip, 'rss-posts')
  if (limited) ctx.throw(429, 'Too Many Requests')

  const topics = ctx.query.topics as string | undefined
  const postType = ctx.query.post_type as string | undefined
  const user = ctx.query.user as string | undefined

  const xml = await buildPostsRssFeed({
    topicSlugs: topics
      ?.split(',')
      .flatMap(s => (s.trim() ? [s.trim()] : []))
      .sort(),
    postType,
    username: user,
  })

  if (apikey) {
    ctx.set('Cache-Control', 'private, max-age=300')
    ctx.set('Referrer-Policy', 'no-referrer')
  } else {
    ctx.set('Cache-Control', 'public, max-age=300')
  }
  ctx.response.buffer(Buffer.from(xml, 'utf-8'), 'application/rss+xml; charset=utf-8')
})
