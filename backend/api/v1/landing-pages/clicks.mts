import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { recordLandingPageItemClick } from '@services/landing-page-analytics'
import { hasGlobalPrivacyControlHeaders, isUUID } from '@modules/utils'
import onError from '@modules/on-error'

const clickRateLimiter = new RateLimiter({
  prefix: 'landing-page-clicks',
  ttlSeconds: 60,
})

app.route('/api/v1/landing-pages/:landingPageId/clicks').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  await ctx.applyRouteRateLimit('POST:/api/v1/landing-pages/:landingPageId/clicks')

  const { landingPageId } = ctx.params
  ctx.assert(landingPageId && isUUID(landingPageId), 400, 'Invalid landingPageId')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  const landingPageItemId =
    body.landing_page_item_id && typeof body.landing_page_item_id === 'string'
      ? body.landing_page_item_id
      : null
  ctx.assert(
    landingPageItemId && isUUID(landingPageItemId),
    400,
    'landing_page_item_id is required and must be a valid UUID',
  )
  const groupMemberId =
    body.group_member_id && typeof body.group_member_id === 'string' && isUUID(body.group_member_id)
      ? body.group_member_id
      : null

  if (hasGlobalPrivacyControlHeaders(ctx.req.headers)) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  const sessionData = await ctx.getSessionTokenData()
  const rateLimitIds = [sessionData.sid, ctx.ip].filter(
    (id): id is string => typeof id === 'string',
  )
  const { limited } = await clickRateLimiter.addAndCheck(rateLimitIds, 21)
  if (limited) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  try {
    await recordLandingPageItemClick({
      landingPageId,
      landingPageItemId,
      groupMemberId,
      sessionId: sessionData.sid,
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }

  ctx.setStatus(200)
  ctx.json({ ok: true })
})
