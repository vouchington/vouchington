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
