import app from '../../app.mts'
import {
  getOptionalAuthAndRateLimit,
  parseJsonBody,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiNoContent, apiRequest, apiResponse } from '../../response-contract.mts'
import { COOKIE_OPTIONS, setAuthenticationCookies } from '@modules/api-utils'
import {
  acknowledgeOAuthAuthorizationCompletion,
  completeOAuthAuthorization,
} from '@services/oauth'
import { assertNotSuspended } from '@services/users/suspension'
import type { Context } from '@jongleberry/api-server'
import { getDeviceContext } from './device-context.mts'

type CompleteOAuthAuthorizationBody = {
  completion_token?: string
  completion_proof_verifier?: string
  acknowledge?: boolean
}

app.route('/api/v1/auth/oauth/authorizations/:flowId/complete').post(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'POST:/api/v1/auth/oauth/authorizations/:flowId/complete',
  )
  if (currentUser) assertNotSuspended(currentUser)
  const flowId = validateUUIDParam(ctx, 'flowId')
  const body = apiRequest(
    'POST:/api/v1/auth/oauth/authorizations/:flowId/complete',
    await parseJsonBody<CompleteOAuthAuthorizationBody>(ctx),
  )
  const cookieCredential = parseOAuthCompletionCookie(ctx.cookies.get('oauth_completion'), flowId)
  const bodyCredential =
    typeof body.completion_token === 'string' ? body.completion_token : undefined
  const completionToken = cookieCredential ?? bodyCredential
  ctx.assert(completionToken, 401, 'OAuth completion token is required')

  const sessionData = await ctx.getSessionTokenData()
  const completionOptions = {
    flowId,
    completionToken,
    completionTokenSource: cookieCredential ? 'cookie' : 'body',
    completionProofVerifier:
      typeof body.completion_proof_verifier === 'string'
        ? body.completion_proof_verifier
        : undefined,
    currentUserId: currentUser?.id,
    deviceId: sessionData.did,
    sessionId: sessionData.sid,
    deviceClass: 'dc' in sessionData ? sessionData.dc : undefined,
    deviceContext: getDeviceContext(ctx),
  } as const

  ctx.set('Cache-Control', 'no-store')
  if (body.acknowledge === true) {
    ctx.assert(cookieCredential, 401, 'OAuth completion acknowledgement requires its web cookie')
    await acknowledgeOAuthAuthorizationCompletion(completionOptions)
    clearCompletionCookie(ctx, flowId)
    apiNoContent('POST:/api/v1/auth/oauth/authorizations/:flowId/complete#acknowledged')
    ctx.setStatus(204)
    return
  }

  const result = await completeOAuthAuthorization(completionOptions)
  if (result.status === 'pending') {
    ctx.setStatus(202)
    ctx.set('Retry-After', '1')
    ctx.json(
      apiResponse('POST:/api/v1/auth/oauth/authorizations/:flowId/complete#pending', {
        status: 'pending' as const,
      }),
    )
    return
  }
  if (result.status === 'mfa_required') {
    ctx.json(
      apiResponse('POST:/api/v1/auth/oauth/authorizations/:flowId/complete#mfa', {
        mfa_required: true as const,
        login_attempt_id: result.loginAttemptId,
      }),
    )
    return
  }
  if (result.status === 'connected') {
    ctx.json(
      apiResponse('POST:/api/v1/auth/oauth/authorizations/:flowId/complete#connected', {
        oauth_account: {
          id: result.account.provider_user_id,
          name: result.name,
          email_address: result.account.provider_user_email_address ?? null,
        },
      }),
    )
    return
  }

  setAuthenticationCookies(ctx, {
    dt: result.deviceToken.token,
    st: result.sessionToken.token,
    deviceClass: result.deviceToken.payload.dc,
  })
  ctx.json(
    apiResponse('POST:/api/v1/auth/oauth/authorizations/:flowId/complete#authenticated', {
      user: {
        id: result.user.id,
        username: result.user.username,
        email_address: result.user.email_address,
        // ast-grep-ignore: no-roles-outside-services
        roles: result.user.roles,
        profile_image_id: result.user.profile_image_id,
      },
    }),
  )
})

function clearCompletionCookie(ctx: Context, flowId: string): void {
  ctx.cookies.set('oauth_completion', '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
    path: `/api/v1/auth/oauth/authorizations/${flowId}/complete`,
  })
}

function parseOAuthCompletionCookie(
  cookie: string | undefined,
  flowId: string,
): string | undefined {
  if (!cookie) return undefined
  const separator = cookie.indexOf('.')
  if (separator === -1 || cookie.slice(0, separator) !== flowId) return undefined
  return cookie.slice(separator + 1) || undefined
}
