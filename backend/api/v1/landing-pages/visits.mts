import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { recordLandingPageVisit } from '@services/landing-page-analytics'
import { resolveUtmSource } from '@ts-shared/utm'
import { hasGlobalPrivacyControlHeaders, isUUID } from '@modules/utils'
import onError from '@modules/on-error'

const visitRateLimiter = new RateLimiter({
  prefix: 'landing-page-visits',
  ttlSeconds: 60,
})

const MAX_REFERRER_LENGTH = 2048
const MAX_UTM_LENGTH = 255

app.route('/api/v1/landing-pages/:landingPageId/visits').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  await ctx.applyRouteRateLimit('POST:/api/v1/landing-pages/:landingPageId/visits')

  const { landingPageId } = ctx.params
  ctx.assert(landingPageId && isUUID(landingPageId), 400, 'Invalid landingPageId')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  const referrer = body.referrer && typeof body.referrer === 'string' ? body.referrer : null
  const utmSource = body.utm_source && typeof body.utm_source === 'string' ? body.utm_source : null
  const utmMedium = body.utm_medium && typeof body.utm_medium === 'string' ? body.utm_medium : null
  const utmCampaign =
    body.utm_campaign && typeof body.utm_campaign === 'string' ? body.utm_campaign : null
  const utmContent =
    body.utm_content && typeof body.utm_content === 'string' ? body.utm_content : null

  if (referrer) ctx.assert(referrer.length <= MAX_REFERRER_LENGTH, 400, 'referrer is too long')
  if (utmSource) ctx.assert(utmSource.length <= MAX_UTM_LENGTH, 400, 'utm_source is too long')
  if (utmMedium) ctx.assert(utmMedium.length <= MAX_UTM_LENGTH, 400, 'utm_medium is too long')
  if (utmCampaign) ctx.assert(utmCampaign.length <= MAX_UTM_LENGTH, 400, 'utm_campaign is too long')
  if (utmContent) ctx.assert(utmContent.length <= MAX_UTM_LENGTH, 400, 'utm_content is too long')

  if (hasGlobalPrivacyControlHeaders(ctx.req.headers)) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  const sessionData = await ctx.getSessionTokenData()
  const rateLimitIds = [sessionData.sid, ctx.ip].filter(
    (id): id is string => typeof id === 'string',
  )
  const { limited } = await visitRateLimiter.addAndCheck(rateLimitIds, 6)
  if (limited) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  try {
    await recordLandingPageVisit({
      landingPageId,
      sessionId: sessionData.sid,
      referrer,
      utmSource: utmSource ? resolveUtmSource(utmSource) : null,
      utmMedium: utmMedium?.toLowerCase().trim() ?? null,
      utmCampaign: utmCampaign?.toLowerCase().trim() ?? null,
      utmContent: utmContent?.toLowerCase().trim() ?? null,
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }

  ctx.setStatus(200)
  ctx.json({ ok: true })
})
