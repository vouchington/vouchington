import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type {
  CommunityModerationDispatcherJobData,
  CommunityModerationPromptJobData,
} from '../types.mts'

const ONE_MINUTE_MS = 60_000

type CommunityModerationItem = { postId: string; communityId: string }

export function enqueueBulkCommunityModerationDispatchers(items: CommunityModerationItem[]): void {
  enqueueBulkCommunityModerationDispatchersAwaited(items).catch(onError)
}

export async function enqueueBulkCommunityModerationDispatchersAwaited(
  items: CommunityModerationItem[],
): Promise<void> {
  if (items.length === 0) return
  const jobs = items.map(({ postId, communityId }) => ({
    name: 'community-moderation-dispatcher' as const,
    data: { postId, communityId } satisfies CommunityModerationDispatcherJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['community-moderation-dispatcher'],
      deduplication: {
        id: `community_moderation_dispatcher_${postId}_${communityId}`,
        mode: 'debounce' as const,
        ttl: ONE_MINUTE_MS,
      },
    } satisfies JobOptions,
  }))
  await ai_agents.addBulk(jobs)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'community-moderation-dispatcher', items.length)
}

export function enqueueCommunityModerationDispatcher(postId: string, communityId: string): void {
  enqueueBulkCommunityModerationDispatchers([{ postId, communityId }])
}

export function enqueueBulkCommunityModerationPrompts(
  items: Array<{ postId: string; communityId: string; promptId: string }>,
): void {
  if (items.length === 0) return
  const jobs = items.map(({ postId, communityId, promptId }) => ({
    name: 'community-moderation-prompt' as const,
    data: { postId, communityId, promptId } satisfies CommunityModerationPromptJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['community-moderation-prompt'],
      deduplication: {
        id: `community_moderation_prompt_${postId}_${communityId}_${promptId}`,
        mode: 'debounce' as const,
        ttl: ONE_MINUTE_MS,
      },
    } satisfies JobOptions,
  }))
  ai_agents.addBulk(jobs).catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'community-moderation-prompt', items.length)
}
