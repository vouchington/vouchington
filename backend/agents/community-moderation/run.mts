import { getCommunityAgentPrompt } from '@services/community-agent-prompts/get'
import { checkExistingModeration, insertAgentModerationResult } from '@services/moderation'
import { createPostModerationContent } from '@services/posts/content'
import { prepareModerationInput, callOpenAIModeration } from '@agents/moderation/openai-moderation'
import { unpublishPostAsAgent } from '@services/communities/publications/moderate'
import onError from '@modules/on-error'
import type { Post } from '@services/posts/types'

interface CommunityModerationResult {
  flagged: boolean
  reason: string
  skipped: boolean
  unpublished?: boolean
  error?: string
}

function createSkippedResult(error?: string): CommunityModerationResult {
  return { flagged: false, reason: '', skipped: true, ...(error && { error }) }
}

interface RunCommunityPromptOptions {
  callModeration?: typeof callOpenAIModeration
  unpublishPost?: typeof unpublishPostAsAgent
}

export async function runCommunityPromptOnPost(
  post: Post,
  communityId: string,
  promptId: string,
  options?: RunCommunityPromptOptions,
): Promise<CommunityModerationResult> {
  const prompt = await getCommunityAgentPrompt(promptId)
  if (!prompt) return createSkippedResult('Prompt not found or not active')
  if (prompt.community_id !== communityId)
    return createSkippedResult('Prompt does not belong to community')
  if (!prompt.slot_allocated || !prompt.activated_at || prompt.deactivated_at) {
    return createSkippedResult('Prompt is not active')
  }

  const { content_sha256: inputSha256, texts, title, markdown } = createPostModerationContent(post)

  if (texts.length === 0) return createSkippedResult('No content to moderate')

  const existing = await checkExistingModeration(post.id, inputSha256, promptId)
  if (existing) {
    return { flagged: existing.flagged, reason: '', skipped: true }
  }

  const input = prepareModerationInput(title, markdown)

  // Build a minimal config compatible with callOpenAIModeration
  const config = {
    moderator_id: prompt.agent_id,
    moderator_slug: `community-prompt-${promptId}`,
    on_flag_action: 'review_queue' as const,
    is_baseline: false,
    // system_user_id is unused here — community prompts don't cast votes
    system_user_id: '',
    prompt: {
      id: promptId,
      prompt: prompt.prompt,
      model_name: prompt.model_name,
      model_provider: prompt.model_provider,
    },
  } as Parameters<typeof callOpenAIModeration>[1]

  const doCallModeration = options?.callModeration ?? callOpenAIModeration
  const configuredModeration = await doCallModeration(input, config, post, communityId)
  const { result } = configuredModeration

  await insertAgentModerationResult(
    post.id,
    inputSha256,
    promptId,
    prompt.agent_id,
    result,
    result.flagged,
  )

  let unpublished = false
  if (result.flagged && prompt.on_flag_action === 'unpublish') {
    try {
      const doUnpublishPost = options?.unpublishPost ?? unpublishPostAsAgent
      unpublished = (await doUnpublishPost(communityId, post.id)) === 'removed'
    } catch (error) {
      onError(error as Error)
      return {
        flagged: result.flagged,
        reason: result.reason,
        skipped: false,
        unpublished: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { flagged: result.flagged, reason: result.reason, skipped: false, unpublished }
}
