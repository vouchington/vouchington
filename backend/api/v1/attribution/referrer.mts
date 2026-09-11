import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { createSessionReferralAttribution } from '@services/attribution'
import { resolveUtmSource } from '@ts-shared/utm'
import { isHttpError } from 'http-errors'
import { hasGlobalPrivacyControlHeaders } from '@modules/utils'

// 10 attribution calls per minute per session/IP (threshold 11 since addAndCheck adds before counting)
const attributionRateLimiter = new RateLimiter({
  prefix: 'attribution-referrer',
  ttlSeconds: 60,
})

const MAX_REFERRER_LENGTH = 255
const MAX_LANDING_URL_LENGTH = 2048

app.route('/api/v1/attribution/referrer').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  await ctx.applyRouteRateLimit('POST:/api/v1/attribution/referrer')

  const body = (await ctx.request.json('100kb')) as Record<string, unknown>
  ctx.assert(body.referrer && typeof body.referrer === 'string', 400, 'referrer is required')
  ctx.assert(body.referrer.length <= MAX_REFERRER_LENGTH, 400, 'referrer is too long')
  ctx.assert(
    body.landing_url && typeof body.landing_url === 'string',
    400,
    'landing_url is required',
  )
  ctx.assert(body.landing_url.length <= MAX_LANDING_URL_LENGTH, 400, 'landing_url is too long')
  const landingUrlHref = (() => {
    try {
      return new URL(body.landing_url).href
    } catch {
      ctx.throw(400, 'landing_url is not a valid URL')
    }
  })()
  ctx.assert(landingUrlHref.length <= MAX_LANDING_URL_LENGTH, 400, 'landing_url is too long')

  const MAX_UTM_LENGTH = 255
  // Extract and validate optional UTM params
  const utmBody =
    body.utm && typeof body.utm === 'object' ? (body.utm as Record<string, unknown>) : null
  const utmSource =
    utmBody?.utm_source && typeof utmBody.utm_source === 'string' ? utmBody.utm_source : null
  const utmMedium =
    utmBody?.utm_medium && typeof utmBody.utm_medium === 'string' ? utmBody.utm_medium : null
  const utmCampaign =
    utmBody?.utm_campaign && typeof utmBody.utm_campaign === 'string' ? utmBody.utm_campaign : null
  const utmContent =
    utmBody?.utm_content && typeof utmBody.utm_content === 'string' ? utmBody.utm_content : null

  if (utmSource) ctx.assert(utmSource.length <= MAX_UTM_LENGTH, 400, 'utm_source is too long')
  if (utmMedium) ctx.assert(utmMedium.length <= MAX_UTM_LENGTH, 400, 'utm_medium is too long')
  if (utmCampaign) ctx.assert(utmCampaign.length <= MAX_UTM_LENGTH, 400, 'utm_campaign is too long')
  if (utmContent) ctx.assert(utmContent.length <= MAX_UTM_LENGTH, 400, 'utm_content is too long')

  // Sanitize: lowercase and trim
  const sanitizedUtm = {
    utmSource: utmSource ? resolveUtmSource(utmSource) : null,
    utmMedium: utmMedium ? utmMedium.toLowerCase().trim() : null,
    utmCampaign: utmCampaign ? utmCampaign.toLowerCase().trim() : null,
    utmContent: utmContent ? utmContent.toLowerCase().trim() : null,
  }

  if (hasGlobalPrivacyControlHeaders(ctx.req.headers)) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  const sessionData = await ctx.getSessionTokenData()

  const rateLimitIds = [sessionData.sid, ctx.ip].filter(
    (id): id is string => typeof id === 'string',
  )
  // Atomically add and check: threshold 11 because we add before checking,
  // so the count reaches 11 on the 11th call, blocking it (>= 11).
  const { limited: isRateLimited } = await attributionRateLimiter.addAndCheck(rateLimitIds, 11)
  if (isRateLimited) {
    ctx.setStatus(200)
    ctx.json({ ok: true })
    return
  }

  // Return 200 for unknown referrers and self-referrals to prevent enumeration
  try {
    await createSessionReferralAttribution({
      sessionId: sessionData.sid,
      referrer: body.referrer,
      landingUrl: landingUrlHref,
      userId: sessionData.uid,
      utm: sanitizedUtm,
    })
  } catch (error: unknown) {
    if (!isHttpError(error) || (error.status !== 404 && error.status !== 400)) throw error
    // Unknown referrer or self-referral — silently ignore
  }

  ctx.setStatus(200)
  ctx.json({ ok: true })
})
