import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users/suspension'
import { getSiteUrl, isUUID } from '@modules/utils'
import {
  beginBlueskyAccountLink,
  completeBlueskyAccountLink,
  finalizeNativeBlueskyAccountLink,
  peekBlueskyAccountLinkAppState,
} from '@services/bluesky-accounts'
import { disconnectBlueskyAccountAndCleanupFollows } from '@services/bluesky-follows'
import { apiOpenApiNoContent, apiRequest } from '../../response-contract.mts'
import createHttpError from 'http-errors'
import {
  completeNativeCallback,
  getBlueskyCallbackErrorCode,
  redirectToLinkUi,
  reportBlueskyCallbackError,
} from './auth-bluesky-callback-helpers.mts'

type BeginBlueskyLinkRequest = {
  handle: string
  callback_mode?: 'web' | 'native'
  completion_proof_challenge?: string
}

type CompleteNativeBlueskyLinkRequest = {
  flow_id: string
  completion_token: string
  completion_proof_verifier: string
}

// POST /api/v1/auth/bluesky/link - begins the AT Protocol OAuth flow for the given handle. Unlike
// the popup-based `PUT /api/v1/auth/oauth/:provider/connect` (auth-oauth.mts), Bluesky account
// linking is a full-page redirect (see the callback route below) — this returns the authorization
// URL as JSON rather than issuing a redirect itself, since it is an authenticated same-origin call
// the frontend then navigates to via window.location.assign().
app.route('/api/v1/auth/bluesky/link').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/bluesky/link')
  assertNotSuspended(currentUser)

  const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)
  ctx.assert(typeof rawBody.handle === 'string', 400, 'handle is required')
  const handle = rawBody.handle.trim()
  ctx.assert(handle.length > 0, 400, 'handle is required')
  const callbackMode = rawBody.callback_mode ?? 'web'
  ctx.assert(
    callbackMode === 'web' || callbackMode === 'native',
    400,
    'callback_mode must be web or native',
  )
  if (callbackMode === 'native') {
    ctx.assert(
      typeof rawBody.completion_proof_challenge === 'string' &&
        /^[A-Za-z0-9_-]{43}$/.test(rawBody.completion_proof_challenge),
      400,
      'completion_proof_challenge must be an S256 challenge',
    )
  } else {
    ctx.assert(
      rawBody.completion_proof_challenge === undefined,
      400,
      'completion_proof_challenge is native-only',
    )
  }
  const requestBody: BeginBlueskyLinkRequest = {
    handle,
    ...(rawBody.callback_mode !== undefined && { callback_mode: callbackMode }),
    ...(callbackMode === 'native' && {
      completion_proof_challenge: rawBody.completion_proof_challenge as string,
    }),
  }
  const body = apiRequest('POST:/api/v1/auth/bluesky/link', requestBody)

  const result = await beginBlueskyAccountLink(
    currentUser.id,
    body.handle,
    body.callback_mode ?? 'web',
    body.completion_proof_challenge,
  )
  ctx.json({
    redirect_url: result.redirectUrl.toString(),
    ...(result.flowId && { flow_id: result.flowId }),
  })
})

// GET /api/v1/auth/bluesky/callback - the AT Protocol authorization server's redirect target. This
// path is fixed by getBlueskyRedirectUri() (baked into the client metadata document Bluesky
// validates client_id/redirect_uris against at authorize time) and cannot be moved. The user's
// browser is redirected here by a third party, so errors must not serialize as JSON: catch them,
// report unexpected failures via onError, then 302 to the linking UI with a bluesky_error code.
// Web mode calls requireAuth inside the try/catch because SameSite=Lax sends the session cookie on
// this cross-site GET, but a 401 must still become a bluesky_error redirect. completeBlueskyAccountLink
// cross-checks this user's id against appState and rejects a mismatch — see its doc comment.
app.route('/api/v1/auth/bluesky/callback').get(async (ctx: Context) => {
  apiOpenApiNoContent('GET:/api/v1/auth/bluesky/callback', 302)
  const params = new URL(ctx.req.url ?? '', getSiteUrl('/')).searchParams
  let appState: Awaited<ReturnType<typeof peekBlueskyAccountLinkAppState>> = null
  let appStateError: unknown
  try {
    appState = await peekBlueskyAccountLinkAppState(params)
  } catch (error) {
    appStateError = error
  }
  if (appState?.callbackMode === 'native' && appState.flowId) {
    await completeNativeCallback(ctx, params, appState.flowId)
    return
  }
  let authenticatedUserId: string | null = null
  try {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/auth/bluesky/callback')
    assertNotSuspended(currentUser)
    authenticatedUserId = currentUser.id
    if (appStateError) {
      throw appStateError instanceof Error ? appStateError : new Error(String(appStateError))
    }
    if (appState?.callbackMode !== 'web' || !appState.flowId) {
      throw createHttpError(400, 'Unable to identify Bluesky OAuth callback flow')
    }
    await completeBlueskyAccountLink(params, currentUser.id, appState.flowId)
    redirectToLinkUi(ctx, { bluesky: 'linked' })
  } catch (error) {
    let callbackError = error
    reportBlueskyCallbackError(callbackError, {
      mode: 'web',
      flowId: appState?.flowId,
      authenticatedUserId,
    })
    redirectToLinkUi(ctx, { bluesky_error: getBlueskyCallbackErrorCode(callbackError) })
  }
})

app.route('/api/v1/auth/bluesky/link-completions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/bluesky/link-completions')
  assertNotSuspended(currentUser)
  const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)
  ctx.assert(
    typeof rawBody.flow_id === 'string' && isUUID(rawBody.flow_id),
    400,
    'flow_id must be a UUID',
  )
  ctx.assert(
    typeof rawBody.completion_proof_verifier === 'string' &&
      /^[A-Za-z0-9._~-]{43,128}$/.test(rawBody.completion_proof_verifier),
    400,
    'completion_proof_verifier is required',
  )
  ctx.assert(
    typeof rawBody.completion_token === 'string' && rawBody.completion_token.length > 0,
    400,
    'completion_token is required',
  )
  const requestBody: CompleteNativeBlueskyLinkRequest = {
    flow_id: rawBody.flow_id,
    completion_token: rawBody.completion_token,
    completion_proof_verifier: rawBody.completion_proof_verifier,
  }
  const body = apiRequest('POST:/api/v1/auth/bluesky/link-completions', requestBody)
  await finalizeNativeBlueskyAccountLink(
    currentUser.id,
    body.flow_id,
    body.completion_token,
    body.completion_proof_verifier,
  )
  ctx.setStatus(204)
})

// DELETE /api/v1/auth/bluesky/link - unlinks the current user's Bluesky account (revokes the AT
// Protocol session, deletes the bluesky_linked_accounts row, and clears any bluesky_follow_records
// receipts for this user — see disconnectBlueskyAccountAndCleanupFollows).
app.route('/api/v1/auth/bluesky/link').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/auth/bluesky/link')
  assertNotSuspended(currentUser)

  await disconnectBlueskyAccountAndCleanupFollows(currentUser.id)
  ctx.setStatus(204)
})
