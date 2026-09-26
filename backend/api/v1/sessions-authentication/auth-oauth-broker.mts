import app from '../../app.mts'
import {
  getOptionalAuthAndRateLimit,
  parseJsonBody,
  validateRequestContract,
} from '../../response-helpers.mts'
import { apiRequest, apiResponse } from '../../response-contract.mts'
import { COOKIE_OPTIONS, getExpectedOrigin } from '@modules/api-utils'
import {
  assertBrokerOAuthProvider,
  beginOAuthAuthorization,
  getConfiguredOAuthProviders,
  getOAuthAuthorizationBrokerCapabilities,
  receiveOAuthAuthorizationCallback,
  type BrokerCallbackMode,
  type BrokerPurpose,
} from '@services/oauth'
import { assertNotSuspended } from '@services/users/suspension'
import type { Context } from '@jongleberry/api-server'
import { enqueueInitialOAuthAuthorizationExchangeBestEffort } from './oauth-broker-callback-enqueue.mts'

type BeginOAuthAuthorizationBody = {
  purpose: 'authenticate' | 'connect'
  callback_mode: 'web' | 'native'
  completion_proof_challenge?: string
}

app.route('/api/v1/auth/oauth/providers').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/auth/oauth/providers')
  ctx.set('Cache-Control', 'no-store')
  const providers = getConfiguredOAuthProviders()
  ctx.json(
    apiResponse('GET:/api/v1/auth/oauth/providers', {
      providers,
      broker_capabilities: getOAuthAuthorizationBrokerCapabilities(providers),
    }),
  )
})

// This is a public route: getOptionalAuthAndRateLimit() (rate limit + optional auth) runs before
// assertBrokerOAuthProvider() so probing an invalid :provider segment can't skip the rate limiter
// (issue #322) — mirroring GET broker-callback below, which already rate-limits first.
app.route('/api/v1/auth/oauth/:provider/authorizations').post(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'POST:/api/v1/auth/oauth/:provider/authorizations',
  )
  if (currentUser) assertNotSuspended(currentUser)
  const provider = assertBrokerOAuthProvider(ctx.params.provider ?? '')
  const body = apiRequest(
    'POST:/api/v1/auth/oauth/:provider/authorizations',
    await parseJsonBody<BeginOAuthAuthorizationBody>(ctx),
  )
  ctx.assert(
    body.purpose === 'authenticate' || body.purpose === 'connect',
    422,
    'purpose must be authenticate or connect',
  )
  ctx.assert(
    body.callback_mode === 'web' || body.callback_mode === 'native',
    422,
    'callback_mode must be web or native',
  )
  // Manual asserts above pin the specific 422 messages this route's tests rely on for an
  // invalid purpose/callback_mode value; the schema check runs after them, against the same
  // body, to add the unrecognized-field and completion_proof_challenge type guard.
  validateRequestContract(ctx, 'POST:/api/v1/auth/oauth/:provider/authorizations', { body })
  const sessionData = await ctx.getSessionTokenData()
  const result = await beginOAuthAuthorization({
    provider,
    purpose: body.purpose as BrokerPurpose,
    callbackMode: body.callback_mode as BrokerCallbackMode,
    completionProofChallenge:
      typeof body.completion_proof_challenge === 'string'
        ? body.completion_proof_challenge
        : undefined,
    currentUserId: currentUser?.id,
    deviceId: sessionData.did,
    sessionId: sessionData.sid,
    expectedOrigin: getExpectedOrigin(ctx.req),
  })
  ctx.json(apiResponse('POST:/api/v1/auth/oauth/:provider/authorizations', result))
})

app.route('/api/v1/auth/oauth/:provider/broker-callback').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/auth/oauth/:provider/broker-callback')
  const result = await receiveOAuthAuthorizationCallback({
    provider: assertBrokerOAuthProvider(ctx.params.provider ?? ''),
    state: typeof ctx.query.state === 'string' ? ctx.query.state : '',
    code: typeof ctx.query.code === 'string' ? ctx.query.code : undefined,
    error: typeof ctx.query.error === 'string' ? ctx.query.error : undefined,
  })
  if (result.exchangeRequired) {
    await enqueueInitialOAuthAuthorizationExchangeBestEffort(result.flowId)
  }

  setRedirectHeaders(ctx)
  if (result.callbackMode === 'web') {
    ctx.cookies.set('oauth_completion', `${result.flowId}.${result.completionToken}`, {
      ...COOKIE_OPTIONS,
      maxAge: remainingAuthorizationSeconds(result.expiresAt),
      path: `/api/v1/auth/oauth/authorizations/${result.flowId}/complete`,
    })
    const url = new URL('/auth/callback/broker', getExpectedOrigin(ctx.req))
    url.searchParams.set('flow_id', result.flowId)
    redirect(ctx, url)
    return
  }
  const url = new URL('voucha://auth/oauth/callback')
  url.searchParams.set('flow_id', result.flowId)
  url.searchParams.set('completion_token', result.completionToken)
  redirect(ctx, url)
})

function remainingAuthorizationSeconds(expiresAt: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
}

function setRedirectHeaders(ctx: Context): void {
  ctx.set('Cache-Control', 'no-store')
  ctx.set('Referrer-Policy', 'no-referrer')
  ctx.set('X-Robots-Tag', 'noindex, nofollow')
}

function redirect(ctx: Context, url: URL): void {
  ctx.setStatus(302)
  ctx.set('Location', url.toString())
  ctx.response.empty()
}
