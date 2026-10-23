import {
  withActiveAccountSession,
  type AccountChangeSession,
} from '@services/mfa/active-account-session'
import { assertFreshReAuth } from '@services/mfa/re-auth'
import createHttpError from 'http-errors'
import { beginBlueskyAuthorization, completeBlueskyCallback } from '@modules/bluesky-oauth'
import { getBlueskyOAuthClient } from './client.mts'
import { getBlueskyLinkedAccountForUser } from './connect.mts'
import { BlueskyStateStore } from './state-store.mts'
import {
  runWithBlueskySessionAuthorization,
  runWithBlueskySessionPersistenceBlocked,
} from './session-lifecycle-context.mts'
import { deleteBlueskySessionForRejectedAuthorization } from './session-store.mts'
import {
  createBlueskyLinkAuthorization,
  getBlueskyLinkAuthorizationForCallbackFromPrimary,
  rejectBlueskyLinkAuthorization,
  type BlueskyLinkAuthorization,
} from './link-authorization.mts'

export type BlueskyLinkCallbackMode = 'web' | 'native'

export interface BlueskyLinkAppState {
  authorizationId: string
  userId: string
  handle: string
  callbackMode: BlueskyLinkCallbackMode
  flowId: string
}

// appState round-trips opaquely through the authorization server, stored server-side in
// BlueskyStateStore keyed by the SDK's own randomly-generated, single-use `state` nonce (see
// state-store.mts) — never exposed to or parsed by the browser, so plain JSON needs no signing.
function encodeAppState(authorizationId: string): string {
  return JSON.stringify({ authorizationId })
}

function decodeAuthorizationId(raw: string | null): string {
  if (!raw) throw createHttpError(400, 'Missing Bluesky OAuth state')
  let parsed: { authorizationId?: unknown }
  try {
    parsed = JSON.parse(raw) as { authorizationId?: unknown }
  } catch {
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  if (typeof parsed.authorizationId !== 'string') {
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  return parsed.authorizationId
}

// Step 1 of account-linking: begins the AT Protocol OAuth flow for `handle`, returning the URL to
// redirect the user's browser to. The existing-link check here is a fast, friendly pre-check, not
// the real guard — the real one is the unique-constraint catch in connectBlueskyAccountToUser,
// which is race-safe against two concurrent link attempts.
export async function beginBlueskyAccountLink(
  userId: string,
  handle: string,
  options: {
    session: AccountChangeSession
    reAuthToken?: string
    callbackMode?: BlueskyLinkCallbackMode
    completionProofChallenge?: string
  },
): Promise<{ redirectUrl: URL; flowId?: string }> {
  const { callbackMode = 'web', completionProofChallenge } = options
  const flowId = await withActiveAccountSession(userId, options.session, async query => {
    await assertFreshReAuth(userId, options.session, options.reAuthToken, query)
    const existing = await getBlueskyLinkedAccountForUser(userId, { query }, true)
    if (existing?.disconnect_requested_at) {
      throw createHttpError(409, 'Your previous Bluesky account is still disconnecting')
    }
    if (existing) throw createHttpError(409, 'You already have a Bluesky account linked')

    return createBlueskyLinkAuthorization({
      userId,
      handle,
      callbackMode,
      completionProofChallenge,
      initiatingSessionId: options.session.sid,
      query,
    })
  })
  let redirectUrl: URL
  try {
    redirectUrl = await beginBlueskyAuthorization(
      await getBlueskyOAuthClient(),
      handle,
      encodeAppState(flowId),
    )
  } catch (err) {
    await rejectBlueskyLinkAuthorization(flowId, userId)
    throw err
  }
  return { redirectUrl, ...(callbackMode === 'native' && { flowId }) }
}

export async function peekBlueskyAccountLinkAppState(
  params: URLSearchParams,
  loadedAuthorization?: BlueskyLinkAuthorization,
): Promise<(BlueskyLinkAppState & { authorization: BlueskyLinkAuthorization }) | null> {
  const stateKey = params.get('state')
  if (!stateKey) return null
  const savedState = await new BlueskyStateStore().get(stateKey)
  if (!savedState) return null
  const authorizationId = decodeAuthorizationId(savedState.appState ?? null)
  const authorization = await getBlueskyLinkAuthorizationForCallbackFromPrimary(
    authorizationId,
    loadedAuthorization,
  )
  return {
    authorization,
    authorizationId,
    userId: authorization.user_id,
    handle: authorization.handle,
    callbackMode: authorization.callback_mode,
    flowId: authorization.id,
  }
}

export async function completeBlueskyAccountLinkCallbackDirect(
  params: URLSearchParams,
  expectedCallbackMode: BlueskyLinkCallbackMode,
  loadedAuthorization: BlueskyLinkAuthorization,
): Promise<{ did: string; state: BlueskyLinkAppState; authorization: BlueskyLinkAuthorization }> {
  const expectedState = await peekBlueskyAccountLinkAppState(params, loadedAuthorization)
  if (expectedState && expectedState.callbackMode !== expectedCallbackMode) {
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  const callback = async () => completeBlueskyCallback(getBlueskyOAuthClient, params)
  const result = expectedState
    ? await runWithBlueskySessionAuthorization(
        {
          authorizationId: expectedState.flowId,
          owner: { kind: 'linking', userId: expectedState.userId },
          callbackMode: expectedState.callbackMode,
        },
        callback,
      )
    : await runWithBlueskySessionPersistenceBlocked(callback)
  let returnedState: BlueskyLinkAppState
  let authorization: BlueskyLinkAuthorization
  try {
    const returnedAuthorizationId = decodeAuthorizationId(result.state)
    // Provider persistence can claim or reject this generation: this read must stay fresh.
    authorization = await getBlueskyLinkAuthorizationForCallbackFromPrimary(returnedAuthorizationId)
    returnedState = {
      authorizationId: returnedAuthorizationId,
      userId: authorization.user_id,
      handle: authorization.handle,
      callbackMode: authorization.callback_mode,
      flowId: authorization.id,
    }
  } catch (err) {
    if (expectedState) {
      await deleteBlueskySessionForRejectedAuthorization(
        expectedState.userId,
        result.session.did,
        expectedState.flowId,
      )
    }
    throw err
  }
  if (returnedState.callbackMode !== expectedCallbackMode) {
    if (expectedState) {
      await deleteBlueskySessionForRejectedAuthorization(
        expectedState.userId,
        result.session.did,
        expectedState.flowId,
      )
    }
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  if (!expectedState) return { did: result.session.did, state: returnedState, authorization }
  if (returnedState.authorizationId !== expectedState.authorizationId) {
    await deleteBlueskySessionForRejectedAuthorization(
      expectedState.userId,
      result.session.did,
      expectedState.flowId,
    )
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  return { did: result.session.did, state: returnedState, authorization }
}
