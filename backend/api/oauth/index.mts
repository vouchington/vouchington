import app from '../app.mts'
import {
  getOptionalAuthAndRateLimit,
  parseJsonBody,
  requireAuth,
  validateUUIDParam,
} from '../response-helpers.mts'
import {
  authenticateOAuthClient,
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  getOAuthAuthorizationErrorRedirect,
  getOAuthAuthorizationRequestForUser,
  OAuthProtocolError,
  registerOAuthClient,
  revokeOAuthToken,
  validateOAuthAuthorizationRequest,
} from '@services/oauth-authorization-server'
import type { Context } from '@jongleberry/api-server'
import { assertNotSuspended } from '@services/users'
import {
  parseFormBody,
  parseOAuthClientAuthentication,
  parseOAuthRegistrationBody,
  queryString,
  redirect,
  requiredFormValue,
  sendOAuthError,
  setOAuthResponseHeaders,
} from './protocol-helpers.mts'

const FORM_MEDIA_TYPES = ['application/x-www-form-urlencoded'] as const

app.route('/authorize').get(async (ctx: Context) => {
  setOAuthResponseHeaders(ctx)
  try {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/authorize')
    const parameters = {
      clientId: queryString(ctx, 'client_id'),
      codeChallenge: ctx.query.code_challenge,
      codeChallengeMethod: ctx.query.code_challenge_method,
      redirectUri: queryString(ctx, 'redirect_uri'),
      resource: ctx.query.resource,
      responseType: ctx.query.response_type,
      scope: ctx.query.scope,
      state: ctx.query.state,
    }
    await validateOAuthAuthorizationRequest(parameters)
    if (!currentUser) {
      redirect(ctx, `/login?next=${encodeURIComponent(ctx.req.url ?? '/authorize')}`)
      return
    }
    assertNotSuspended(currentUser)
    const session = await ctx.getSessionTokenData()
    const result = await beginOAuthAuthorizationRequest({
      deviceId: session.did,
      sessionId: session.sid,
      userId: currentUser.id,
      ...parameters,
    })
    redirect(ctx, `/oauth/consent?request_id=${encodeURIComponent(result.request_id)}`)
  } catch (error) {
    if (!(error instanceof OAuthProtocolError)) throw error
    const location = await getOAuthAuthorizationErrorRedirect({
      clientId: queryString(ctx, 'client_id'),
      redirectUri: queryString(ctx, 'redirect_uri'),
      state: ctx.query.state,
      error,
    })
    if (location) {
      redirect(ctx, location)
      return
    }
    sendOAuthError(ctx, error)
  }
})

app.route('/register').post(async (ctx: Context) => {
  setOAuthResponseHeaders(ctx)
  await ctx.applyRouteRateLimit('POST:/register', { identityMode: 'ip-only' })
  try {
    const client = await registerOAuthClient(await parseOAuthRegistrationBody(ctx))
    ctx.setStatus(201)
    ctx.json(client)
  } catch (error) {
    if (!(error instanceof OAuthProtocolError)) throw error
    sendOAuthError(ctx, error)
  }
})

app.route('/token').post(
  async (ctx: Context) => {
    setOAuthResponseHeaders(ctx)
    await ctx.applyRouteRateLimit('POST:/token', { identityMode: 'ip-only' })
    try {
      const form = await parseFormBody(ctx)
      const client = parseOAuthClientAuthentication(ctx, form)
      await authenticateOAuthClient(client.clientId, client.clientSecret)
      const grantType = form.get('grant_type')
      if (grantType === 'authorization_code') {
        ctx.json(
          await exchangeOAuthAuthorizationCode({
            clientId: client.clientId,
            clientSecret: client.clientSecret,
            code: requiredFormValue(form, 'code'),
            codeVerifier: form.get('code_verifier'),
            redirectUri: requiredFormValue(form, 'redirect_uri'),
          }),
        )
        return
      }
      if (grantType === 'refresh_token') {
        ctx.json(
          await exchangeOAuthRefreshToken({
            clientId: client.clientId,
            clientSecret: client.clientSecret,
            refreshToken: requiredFormValue(form, 'refresh_token'),
            ...(form.has('scope') ? { scope: requiredFormValue(form, 'scope') } : {}),
          }),
        )
        return
      }
      throw new OAuthProtocolError('unsupported_grant_type', 'grant_type is not supported')
    } catch (error) {
      if (!(error instanceof OAuthProtocolError)) throw error
      sendOAuthError(ctx, error)
    }
  },
  { acceptedMediaTypes: FORM_MEDIA_TYPES },
)

app.route('/revoke').post(
  async (ctx: Context) => {
    setOAuthResponseHeaders(ctx)
    await ctx.applyRouteRateLimit('POST:/revoke', { identityMode: 'ip-only' })
    try {
      const form = await parseFormBody(ctx)
      const client = parseOAuthClientAuthentication(ctx, form)
      await revokeOAuthToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        token: requiredFormValue(form, 'token'),
      })
      ctx.setStatus(200)
      ctx.response.empty()
    } catch (error) {
      if (!(error instanceof OAuthProtocolError)) throw error
      sendOAuthError(ctx, error)
    }
  },
  { acceptedMediaTypes: FORM_MEDIA_TYPES },
)

app.route('/api/v1/oauth/authorization-requests/:id').get(async (ctx: Context) => {
  setOAuthResponseHeaders(ctx)
  const authorizationContext = await getOAuthAuthorizationReadContext(
    ctx,
    'GET:/api/v1/oauth/authorization-requests/:id',
  )
  const request = await getOAuthAuthorizationRequestForUser(
    authorizationContext.userId,
    validateUUIDParam(ctx, 'id'),
    authorizationContext.browserBindingHash,
  )
  ctx.assert(request, 404, 'Not Found')
  ctx.json({ authorization_request: request })
})

app.route('/api/v1/oauth/authorization-requests/:id/decisions').post(async (ctx: Context) => {
  setOAuthResponseHeaders(ctx)
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/oauth/authorization-requests/:id/decisions',
  )
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<{ decision?: unknown }>(ctx)
  ctx.assert(body?.decision === 'approve' || body?.decision === 'deny', 422, 'Invalid decision')
  const session = await ctx.getSessionTokenData()
  const result = await decideOAuthAuthorizationRequest(
    currentUser.id,
    validateUUIDParam(ctx, 'id'),
    body.decision,
    createOAuthBrowserBindingHash(session.did, session.sid),
  )
  ctx.json(result)
})
async function getOAuthAuthorizationReadContext(
  ctx: Context,
  routeKey: 'GET:/api/v1/oauth/authorization-requests/:id',
): Promise<{ browserBindingHash: string; userId: string }> {
  const currentUser = await requireAuth(ctx, routeKey)
  const session = await ctx.getSessionTokenData()
  return {
    browserBindingHash: createOAuthBrowserBindingHash(session.did, session.sid),
    userId: currentUser.id,
  }
}
