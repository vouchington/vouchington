import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { addRecentlyViewed } from '@services/recently-viewed'
import { hasGlobalPrivacyControlHeaders, isUUID } from '@modules/utils'
import onError from '@modules/on-error'
import { decodeJwt } from 'jose'
import { validateRequestContract } from '../../response-helpers.mts'

const viewRateLimiter = new RateLimiter({
  prefix: 'rss-feed-views',
  ttlSeconds: 60,
})

app.route('/api/v1/rss-feeds/:rssFeedId/views').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/rss-feeds/:rssFeedId/views')

  const { rssFeedId } = ctx.params
  ctx.assert(rssFeedId && isUUID(rssFeedId), 400, 'Invalid rssFeedId')
  validateRequestContract(ctx, 'POST:/api/v1/rss-feeds/:rssFeedId/views', { path: ctx.params })

  if (hasGlobalPrivacyControlHeaders(ctx.req.headers)) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  const sessionData = await ctx.getSessionTokenData()
  const rateLimitIds = [getViewRateLimitId(ctx, sessionData.sid)]
  const { limited } = await viewRateLimiter.addAndCheck(rateLimitIds, 6)
  if (limited) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  try {
    await addRecentlyViewed(sessionData.sid, sessionData.uid ?? null, 'rss_feed', rssFeedId)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }

  ctx.setStatus(200)
  ctx.json({ ok: true })
})

function getViewRateLimitId(ctx: Context, resolvedSessionId: string): string {
  const requestSessionToken = ctx.cookies.get('st')
  if (requestSessionToken && sessionTokenHasSessionId(requestSessionToken, resolvedSessionId)) {
    return resolvedSessionId
  }

  return ctx.ip ?? resolvedSessionId
}

function sessionTokenHasSessionId(sessionToken: string, sessionId: string): boolean {
  try {
    return decodeJwt(sessionToken).sid === sessionId
  } catch {
    return false
  }
}
