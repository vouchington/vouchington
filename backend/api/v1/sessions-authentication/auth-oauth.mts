import app from '../../app.mts'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import { getExpectedOrigin, setAuthenticationCookies } from '@modules/api-utils'
import { assertValidProvider, connectOAuthAccountFlow, continueOAuthFlow } from '@services/oauth'
import { disconnectOAuthAccount } from '@services/my/oauth-account'
import { assertNotSuspended } from '@services/users/suspension'
import { getDeviceContext } from './device-context.mts'
import './auth-oauth-broker.mts'
import './auth-oauth-completion.mts'

// PUT /api/v1/auth/oauth/:provider/connect - Connect OAuth account to existing user. This is a
// protected route: requireAuth() runs before assertValidProvider() so an unauthenticated caller
// hitting an invalid :provider segment gets a bare 401, not the "Invalid OAuth provider: x" 400
// diagnostic that would otherwise leak before authentication (issue #322).
app.route('/api/v1/auth/oauth/:provider/connect').put(async ctx => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/auth/oauth/:provider/connect')
  assertNotSuspended(currentUser)
  const provider = assertValidProvider(ctx.params.provider ?? '')

  const body = (await ctx.request.json('100kb')) as Record<string, unknown>
  validateRequestContract(ctx, 'PUT:/api/v1/auth/oauth/:provider/connect', { body })
  const { account, name } = await connectOAuthAccountFlow({
    provider,
    currentUserId: currentUser.id,
    body,
    expectedOrigin: getExpectedOrigin(ctx.req),
  })
  ctx.json({
    oauth_account: {
      id: account.provider_user_id,
      name,
      email_address: account.provider_user_email_address ?? null,
    },
  })
})

// DELETE /api/v1/auth/oauth/:provider/connect - Disconnect OAuth account. Same protected-route
// ordering as PUT connect above: requireAuth() before assertValidProvider().
app.route('/api/v1/auth/oauth/:provider/connect').delete(async ctx => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/auth/oauth/:provider/connect')
  assertNotSuspended(currentUser)
  const provider = assertValidProvider(ctx.params.provider ?? '')
  await disconnectOAuthAccount(currentUser.id, provider)
  ctx.setStatus(204)
})

// POST /api/v1/auth/oauth/:provider/continue - Login or signup with OAuth. This is a public
// route: getOptionalAuthAndRateLimit() (rate limit + optional auth) runs before
// assertValidProvider() so probing an invalid :provider segment can't skip the rate limiter
// (issue #322).
app.route('/api/v1/auth/oauth/:provider/continue').post(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'POST:/api/v1/auth/oauth/:provider/continue',
  )
  const provider = assertValidProvider(ctx.params.provider ?? '')
  if (currentUser) {
    ctx.json({
      user: {
        id: currentUser.id,
        username: currentUser.username,
        email_address: currentUser.email_address,
        // ast-grep-ignore: no-roles-outside-services
        roles: currentUser.roles,
        profile_image_id: currentUser.profile_image_id,
      },
    })
    return
  }

  const body = (await ctx.request.json('100kb')) as Record<string, unknown>
  validateRequestContract(ctx, 'POST:/api/v1/auth/oauth/:provider/continue', { body })
  const sessionData = await ctx.getSessionTokenData()
  const result = await continueOAuthFlow({
    provider,
    body,
    expectedOrigin: getExpectedOrigin(ctx.req),
    deviceId: sessionData.did,
    sessionId: sessionData.sid,
    deviceClass: 'dc' in sessionData ? sessionData.dc : undefined,
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
    user: {
      id: result.user.id,
      username: result.user.username,
      email_address: result.user.email_address,
      // ast-grep-ignore: no-roles-outside-services
      roles: result.user.roles,
      profile_image_id: result.user.profile_image_id,
    },
  })
})
