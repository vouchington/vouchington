import type { Job } from 'glide-mq'
import type {
  CommunityModerationDispatcherJobData,
  CommunityModerationPromptJobData,
} from '@queues/ai-agents/types'
import { getPostByAny } from '@services/posts/get'
import { createPostModerationContent } from '@services/posts/content'
import { getActiveCommunityAgentPrompts } from '@services/community-agent-prompts/get-active-prompts'
import { getAlreadyModeratedPromptIds } from '@services/moderation'
import { runCommunityPromptOnPost } from '@agents/community-moderation'
import { enqueueBulkCommunityModerationPrompts } from '@queues/ai-agents/enqueues/community-moderation'

export async function processCommunityModerationDispatcher(
  job: Job<CommunityModerationDispatcherJobData>,
): Promise<unknown> {
  const { postId, communityId } = job.data
  const post = await getPostByAny(postId)
  if (!post) return { count: 0, skipped: true, reason: 'Post not found' }

  const { content_sha256: inputSha256 } = createPostModerationContent(post)
  const activePrompts = await getActiveCommunityAgentPrompts(communityId)
  if (activePrompts.length === 0)
    return { count: 0, skipped: true, reason: 'No active prompts for this community' }

  const existingPromptIds = await getAlreadyModeratedPromptIds(
    postId,
    inputSha256,
    activePrompts.map(p => p.id),
  )
  const promptsNeedingRun = activePrompts.filter(p => !existingPromptIds.has(p.id))
  if (promptsNeedingRun.length === 0)
    return { count: 0, skipped: true, reason: 'All prompts already processed this content' }

  void enqueueBulkCommunityModerationPrompts(
    promptsNeedingRun.map(p => ({ postId, communityId, promptId: p.id })),
  )

  return { success: true, dispatched: true, count: promptsNeedingRun.length, skipped: false }
}

export async function processCommunityModerationPrompt(
  job: Job<CommunityModerationPromptJobData>,
): Promise<unknown> {
  const post = await getPostByAny(job.data.postId)
  if (!post) return { success: false, reason: 'Post not found' }

  const result = await runCommunityPromptOnPost(post, job.data.communityId, job.data.promptId)
  return {
    success: !result.error,
    flagged: result.flagged,
    skipped: result.skipped,
    error: result.error,
  }
}
