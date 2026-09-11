import createHttpError from 'http-errors'
import { completeBlueskyAccountLinkCallbackDirect } from './link.mts'
import { connectBlueskyAccountToUser } from './connect.mts'
import {
  getBlueskyLinkAuthorizationForCallbackFromPrimary,
  rejectBlueskyLinkAuthorization,
} from './link-authorization.mts'
import { persistNativeBlueskyLinkCompletion } from './native-completion-persistence.mts'
import { deleteBlueskySessionForRejectedAuthorization } from './session-generation.mts'

export async function completeWebBlueskyAccountLinkDurably(input: {
  params: string
  flowId: string
  currentUserId: string
}): Promise<{ did: string; handle: string }> {
  let authorization = await getBlueskyLinkAuthorizationForCallbackFromPrimary(input.flowId)
  if (authorization.callback_mode !== 'web') {
    await rejectBlueskyCallbackGeneration(authorization)
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  if (authorization.user_id !== input.currentUserId) {
    await rejectBlueskyCallbackGeneration(authorization)
    throw createHttpError(403, 'This Bluesky sign-in was started from a different Voucha session')
  }

  if (authorization.status === 'pending') {
    const result = await completeBlueskyAccountLinkCallbackDirect(
      new URLSearchParams(input.params),
      'web',
    )
    if (result.state.flowId !== input.flowId || result.state.userId !== input.currentUserId) {
      await deleteBlueskySessionForRejectedAuthorization(
        result.state.userId,
        result.did,
        result.state.flowId,
      )
      throw createHttpError(400, 'Invalid Bluesky OAuth state')
    }
    authorization = await getBlueskyLinkAuthorizationForCallbackFromPrimary(input.flowId)
    if (authorization.status === 'pending') {
      await rejectBlueskyCallbackGeneration(authorization)
      throw createHttpError(
        404,
        'Bluesky account not found — complete the Bluesky sign-in step first',
      )
    }
  }

  const did = authorization.claimed_did
  if (!did) throw createHttpError(409, 'Bluesky callback has not completed')
  try {
    await connectBlueskyAccountToUser(input.currentUserId, did, authorization.handle, {
      linkAuthorizationId: input.flowId,
    })
  } catch (error) {
    await rejectBlueskyCallbackGeneration(authorization)
    throw error
  }
  return { did, handle: authorization.handle }
}

export async function completeNativeBlueskyAccountLinkDurably(input: {
  params: string
  flowId: string
  completionTokenHash: string
}): Promise<null> {
  let authorization = await getBlueskyLinkAuthorizationForCallbackFromPrimary(input.flowId)
  if (authorization.callback_mode !== 'native') {
    await rejectBlueskyCallbackGeneration(authorization)
    throw createHttpError(400, 'Invalid Bluesky OAuth state')
  }
  if (authorization.status === 'pending') {
    const result = await completeBlueskyAccountLinkCallbackDirect(
      new URLSearchParams(input.params),
      'native',
    )
    if (result.state.flowId !== input.flowId) {
      await deleteBlueskySessionForRejectedAuthorization(
        result.state.userId,
        result.did,
        result.state.flowId,
      )
      throw createHttpError(400, 'Invalid Bluesky OAuth state')
    }
    authorization = await getBlueskyLinkAuthorizationForCallbackFromPrimary(input.flowId)
    if (authorization.status === 'pending') {
      await rejectBlueskyCallbackGeneration(authorization)
      throw createHttpError(
        404,
        'Bluesky account not found — complete the Bluesky sign-in step first',
      )
    }
  }
  const did = authorization.claimed_did
  if (!did) throw createHttpError(409, 'Bluesky callback has not completed')
  await persistNativeBlueskyLinkCompletion({
    flowId: input.flowId,
    userId: authorization.user_id,
    did,
    handle: authorization.handle,
    tokenHash: input.completionTokenHash,
  })
  return null
}

async function rejectBlueskyCallbackGeneration(
  authorization: Awaited<ReturnType<typeof getBlueskyLinkAuthorizationForCallbackFromPrimary>>,
): Promise<void> {
  if (authorization.claimed_did) {
    await deleteBlueskySessionForRejectedAuthorization(
      authorization.user_id,
      authorization.claimed_did,
      authorization.id,
    )
    return
  }
  await rejectBlueskyLinkAuthorization(authorization.id, authorization.user_id)
}
