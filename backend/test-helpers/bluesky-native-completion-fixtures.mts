import { v7 } from 'uuid'
import { createTestAccountChangeActor } from './account-change.mts'
import {
  getTestBlueskyCompletionProofVerifier,
  insertTestBlueskyLinkedAccount,
} from './entities/bluesky-linked-accounts.mts'
import { createNativeCompletionToken } from '../services/bluesky-accounts/native-completion-token.mts'
import { persistNativeBlueskyLinkCompletion } from '../services/bluesky-accounts/native-completion-persistence.mts'

export async function createNativeBlueskyLinkCompletion(input: {
  flowId: string
  userId: string
  did: string
  handle: string
}): Promise<string> {
  const { token, tokenHash } = createNativeCompletionToken(input.flowId)
  await persistNativeBlueskyLinkCompletion({ ...input, tokenHash })
  return token
}

/** A real native handoff admitted by an active user/session/device fixture. */
export async function createTestNativeBlueskyCompletionFixture(userId: string) {
  const flowId = v7()
  const { session } = await createTestAccountChangeActor(userId)
  const account = await insertTestBlueskyLinkedAccount({
    userId: null,
    linkingUserId: userId,
    authorizationId: flowId,
    nativeFlowId: flowId,
    initiatingSessionId: session.sid,
  })
  const token = await createNativeBlueskyLinkCompletion({
    flowId,
    userId,
    did: account.bluesky_did,
    handle: `${v7()}.bsky.social`,
  })
  return {
    flowId,
    token,
    did: account.bluesky_did,
    session,
    verifier: getTestBlueskyCompletionProofVerifier(flowId),
  }
}
