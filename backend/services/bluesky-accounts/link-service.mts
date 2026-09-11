import { beginBlueskyAccountLinkDirect, type BlueskyLinkCallbackMode } from './link.mts'
import {
  completeNativeBlueskyAccountLinkDurably,
  completeWebBlueskyAccountLinkDurably,
} from './callback-completion.mts'

export function beginBlueskyAccountLink(
  userId: string,
  handle: string,
  callbackMode: BlueskyLinkCallbackMode = 'web',
  completionProofChallenge?: string,
): Promise<{ redirectUrl: URL; flowId?: string }> {
  return beginBlueskyAccountLinkDirect(userId, handle, callbackMode, completionProofChallenge)
}

export function completeNativeBlueskyAccountLink(
  params: URLSearchParams,
  flowId: string,
  completionTokenHash: string,
): Promise<null> {
  return completeNativeBlueskyAccountLinkDurably({
    params: params.toString(),
    flowId,
    completionTokenHash,
  })
}

export async function completeBlueskyAccountLink(
  params: URLSearchParams,
  currentUserId: string,
  flowId: string,
): Promise<{ did: string; handle: string }> {
  return await completeWebBlueskyAccountLinkDurably({
    params: params.toString(),
    flowId,
    currentUserId,
  })
}
