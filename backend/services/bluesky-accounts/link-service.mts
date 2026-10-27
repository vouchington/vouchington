import type { BlueskyLinkAuthorization } from './link-authorization.mts'
import {
  completeNativeBlueskyAccountLinkDurably,
  completeWebBlueskyAccountLinkDurably,
} from './callback-completion.mts'

export function completeNativeBlueskyAccountLink(
  params: URLSearchParams,
  flowId: string,
  completionTokenHash: string,
  authorization?: BlueskyLinkAuthorization,
): Promise<null> {
  return completeNativeBlueskyAccountLinkDurably({
    params: params.toString(),
    flowId,
    completionTokenHash,
    authorization,
  })
}

export async function completeBlueskyAccountLink(
  params: URLSearchParams,
  currentUserId: string,
  flowId: string,
): Promise<{ did: string; handle: string }> {
  return completeWebBlueskyAccountLinkDurably({
    params: params.toString(),
    flowId,
    currentUserId,
  })
}
