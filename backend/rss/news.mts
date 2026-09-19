import app from '@voucha/api/app'
import type { Context } from '@jongleberry/api-server'
import { validateApiKey } from '@services/api-keys/validate'
import { buildNewsFeed } from '@services/rss-xml/news-feed'
import { checkRssRateLimit } from '@services/rss-xml/rate-limiter'

app.route('/rss/news').get(async (ctx: Context) => {
  const apikey = ctx.query.apikey as string | undefined
  let rateLimitId: string

  if (apikey) {
    const { valid, apiKey } = await validateApiKey(apikey, 'rss:read')
    if (!valid || !apiKey) ctx.throw(403, 'Invalid API key or insufficient permissions')
    rateLimitId = `key:${apiKey.id}`
  } else {
    if (!ctx.ip) ctx.throw(400, 'IP address required for anonymous access')
    rateLimitId = `anon:${ctx.ip}`
  }

  const limited = await checkRssRateLimit(rateLimitId, ctx.ip, 'rss-news')
  if (limited) ctx.throw(429, 'Too Many Requests')

  const topics = ctx.query.topics as string | undefined
  const sources = ctx.query.sources as string | undefined
  const categoryTopic = ctx.query.category_topic as string | undefined

  const xml = await buildNewsFeed({
    topicSlugs: topics
      ?.split(',')
      .flatMap(s => (s.trim() ? [s.trim()] : []))
      .sort(),
    sourceTopicSlugs: sources
      ?.split(',')
      .flatMap(s => (s.trim() ? [s.trim()] : []))
      .sort(),
    categoryTopicSlugs: categoryTopic
      ?.split(',')
      .flatMap(s => (s.trim() ? [s.trim()] : []))
      .sort(),
  })

  if (apikey) {
    ctx.set('Cache-Control', 'private, max-age=300')
    ctx.set('Referrer-Policy', 'no-referrer')
  } else {
    ctx.set('Cache-Control', 'public, max-age=300')
  }
  ctx.response.buffer(Buffer.from(xml, 'utf-8'), 'application/rss+xml; charset=utf-8')
})
