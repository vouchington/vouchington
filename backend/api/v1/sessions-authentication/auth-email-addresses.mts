import app from '../../app.mts'
import {
  requestEmailAddressLoginToken as requestEmailAddressLoginTokenFlow,
  loginWithEmailAddressToken as loginWithEmailAddressTokenFlow,
} from '@services/users'
import { setAuthenticationCookies } from '@modules/api-utils'
import { isHoneypotTriggered } from '@services/honeypot'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { getDeviceContext } from './device-context.mts'
import { validateRequestContract } from '../../response-helpers.mts'

import type { Context } from '@jongleberry/api-server'

type EmailAddressTokenBody = {
  emailAddress?: string
  email_address?: string
  cfTurnstileResponse?: string
  cf_turnstile_response?: string
  dt?: string
  st?: string
  uiLocale?: string | null
  ui_locale?: string | null
  hp_website?: string
  hp_phone?: string
}

type EmailAddressLoginBody = {
  emailAddress?: string
  email_address?: string
  token?: string
  otp?: string
  dt?: string
  st?: string
  hp_website?: string
  hp_phone?: string
}

app.route('/api/v1/auth/email-address/tokens').post(async (ctx: Context) => {
  const routeKey = 'POST:/api/v1/auth/email-address/tokens'
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  let body: EmailAddressTokenBody
  try {
    body = normalizeEmailAddressJsonBody((await ctx.request.json('100kb')) as EmailAddressTokenBody)
  } catch (error) {
    await ctx.applyRouteRateLimit(routeKey)
    throw error
  }
  await applyEmailAddressRouteRateLimit(ctx, routeKey, body)

  if (isHoneypotTriggered(body as Record<string, unknown>)) {
    ctx.json({ email_address: body.emailAddress || body.email_address || '' })
    return
  }

  validateRequestContract(ctx, routeKey, { body })
  const emailAddress = body.emailAddress || body.email_address
  ctx.assert(emailAddress, 422, 'emailAddress is required')
  const rawUiLocale = body.uiLocale ?? body.ui_locale

  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  await verifyCaptchaOrAttestation(ctx, body, {
    actionTag: 'auth.email-address-tokens',
    fieldNames: ['cf_turnstile_response', 'cfTurnstileResponse'],
  })

  const sessionData = await ctx.getSessionTokenData(body.st, body.dt)
  const result = await requestEmailAddressLoginTokenFlow({
    emailAddress,
    ip: ctx.ip,
    deviceId: sessionData.did,
    sessionId: sessionData.sid,
    uiLocale: rawUiLocale,
  })
  ctx.json({ email_address: result.emailAddress })
})

app.route('/api/v1/auth/email-address/login').post(async (ctx: Context) => {
  const routeKey = 'POST:/api/v1/auth/email-address/login'
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  let body: EmailAddressLoginBody
  try {
    body = normalizeEmailAddressJsonBody((await ctx.request.json('100kb')) as EmailAddressLoginBody)
  } catch (error) {
    await ctx.applyRouteRateLimit(routeKey)
    throw error
  }
  await applyEmailAddressRouteRateLimit(ctx, routeKey, body)

  if (isHoneypotTriggered(body as Record<string, unknown>)) {
    ctx.throw(401, 'Invalid email address or one-time password')
  }

  validateRequestContract(ctx, routeKey, { body })
  const emailAddress = body.emailAddress || body.email_address
  const token = body.token || body.otp
  ctx.assert(emailAddress, 422, 'emailAddress is required')
  ctx.assert(token, 422, 'otp is required')

  const sessionData = await ctx.getSessionTokenData(body.st, body.dt)
  const deviceClass = 'dc' in sessionData ? sessionData.dc : undefined
  const result = await loginWithEmailAddressTokenFlow({
    emailAddress,
    token,
    ip: ctx.ip,
    deviceId: sessionData.did,
    sessionId: sessionData.sid,
    deviceClass,
    deviceContext: getDeviceContext(ctx),
  })

  if (result.mfaRequired) {
    ctx.json({ mfa_required: true, login_attempt_id: result.loginAttemptId })
    return
  }

  setAuthenticationCookies(ctx, {
    dt: result.deviceToken.token,
    st: result.sessionToken.token,
    deviceClass: result.deviceToken.payload.dc,
  })

  ctx.json({
    user: result.user,
    did: result.deviceToken.payload.did,
    sid: result.sessionToken.payload.sid,
    uid: result.user.id,
    dt: result.deviceToken,
    st: result.sessionToken,
    session: result.sessionToken.payload,
  })
})

function normalizeEmailAddressJsonBody<Body>(parsed: Body): Body {
  const isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  return isPlainObject ? parsed : ({} as Body)
}

async function applyEmailAddressRouteRateLimit(
  ctx: Context,
  routeKey: string,
  body: { dt?: unknown; st?: unknown },
): Promise<void> {
  const deviceToken = typeof body.dt === 'string' && body.dt.length > 0 ? body.dt : undefined
  const sessionToken = typeof body.st === 'string' && body.st.length > 0 ? body.st : undefined

  if (deviceToken && sessionToken) {
    await ctx.applyRouteRateLimit(routeKey, { deviceToken, sessionToken })
    return
  }

  await ctx.applyRouteRateLimit(routeKey)
}
