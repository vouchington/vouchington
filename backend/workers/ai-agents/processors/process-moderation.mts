import type { Job } from 'glide-mq'
import type { ModerationDispatcherJobData, ModerationPromptJobData } from '@queues/ai-agents/types'
import { getPostByAny } from '@services/posts/get'
import { createPostModerationContent } from '@services/posts/content'
import {
  assertCommunityAutoTaggerAgentEnabled,
  getDisabledCommunityAutoTaggerModeratorSlugs,
  getEnabledCommunityAutoTaggerModeratorSlugs,
  getActivePostLLMModerators,
  getAllActiveModerationConfigs,
  getPostModeratorsNeedingRun,
} from '@services/moderation'
import { runModeratorOnPost } from '@agents/moderation'
import { enqueueBulkModerationPrompts } from '@queues/ai-agents/enqueues/moderation'
import { detectAiGeneratedModeration } from './ai-generated-content.mts'

export async function processModerationDispatcher(
  job: Job<ModerationDispatcherJobData>,
): Promise<unknown> {
  const postId = job.data.id
  const post = await getPostByAny(postId)
  if (!post) return { count: 0, moderators: [], skipped: true, reason: 'Post not found' }

  const { content_sha256 } = createPostModerationContent(post)
  const allModerators = await getActivePostLLMModerators()
  if (allModerators.length === 0)
    return { count: 0, moderators: [], skipped: true, reason: 'No active moderators' }

  const allConfigs = await getAllActiveModerationConfigs()

  // Compute effective slug set: (baseline − disabled) ∪ community-enabled.
  // Baseline wins dedup so the recheck in the prompt processor is skipped.
  const [disabledSlugs, enabledCommunitySlugs] = await Promise.all([
    getDisabledCommunityAutoTaggerModeratorSlugs(post.community_id),
    getEnabledCommunityAutoTaggerModeratorSlugs(post.community_id),
  ])
  const disabledSet = new Set<string>(disabledSlugs)
  const activeBaselineSlugs = allConfigs.flatMap(c =>
    c.is_baseline && !disabledSet.has(c.moderator_slug) ? [c.moderator_slug] : [],
  )
  const baselineSet = new Set<string>(activeBaselineSlugs)
  const communityOnlySlugs = enabledCommunitySlugs.filter(s => !baselineSet.has(s))

  const sourceMap = new Map<string, 'baseline' | 'community'>([
    ...activeBaselineSlugs.map(s => [s, 'baseline'] as const),
    ...communityOnlySlugs.map(s => [s, 'community'] as const),
  ])

  const effectiveSlugSet = new Set<string>(sourceMap.keys())
  if (effectiveSlugSet.size === 0)
    return { count: 0, moderators: [], skipped: true, reason: 'No effective moderators' }

  const moderatorConfigs = allConfigs.filter(config => effectiveSlugSet.has(config.moderator_slug))
  if (moderatorConfigs.length === 0)
    return { count: 0, moderators: [], skipped: true, reason: 'No active moderator prompts' }

  const moderatorsNeedingRun = await getPostModeratorsNeedingRun(
    postId,
    content_sha256,
    moderatorConfigs,
  )
  if (moderatorsNeedingRun.length === 0)
    return {
      count: 0,
      moderators: [],
      skipped: true,
      reason: 'All moderators already processed this content',
    }

  const items = moderatorsNeedingRun.map(m => ({
    postId,
    moderatorSlug: m.moderator_slug,
    source: sourceMap.get(m.moderator_slug) ?? ('community' as const),
  }))
  await enqueueBulkModerationPrompts(items)

  return {
    success: true,
    dispatched: true,
    moderators_count: moderatorsNeedingRun.length,
    moderators: moderatorsNeedingRun.map(m => m.moderator_slug),
  }
}

export async function processModerationPrompt(job: Job<ModerationPromptJobData>): Promise<unknown> {
  const post = await getPostByAny(job.data.id)
  if (!post) return null

  // Baseline jobs are gated at dispatch time (disabled-row opt-out), not per-job.
  // Community jobs re-check that the agent is still enabled before running.
  if (
    job.data.source !== 'baseline' &&
    !(await assertCommunityAutoTaggerAgentEnabled(post.community_id, job.data.moderatorSlug))
  ) {
    return {
      success: true,
      moderator_slug: job.data.moderatorSlug,
      moderation_id: null,
      flagged: false,
      skipped: true,
      reason: 'Community AI agent disabled',
    }
  }

  const result = await runModeratorOnPost(post, job.data.moderatorSlug, {
    detectAiGenerated: detectAiGeneratedModeration,
    communityId: post.community_id,
  })
  return {
    success: result.error === undefined,
    moderator_slug: result.moderator_slug,
    moderation_id: result.moderation_id,
    flagged: result.flagged,
    skipped: result.skipped,
    tagged_topics: result.tagged_topics,
    error: result.error,
  }
}
