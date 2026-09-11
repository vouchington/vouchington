import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ModerationDispatcherJobData, ModerationPromptJobData } from '../types.mts'

const ONE_MINUTE_MS = 60_000

export function enqueueModerationDispatcher(postId: string, priority?: number): void {
  ai_agents
    .add(
      'moderation-dispatcher',
      { id: postId } satisfies ModerationDispatcherJobData,
      {
        attempts: AI_AGENTS_DEFAULTS.attempts,
        backoff: AI_AGENTS_DEFAULTS.backoff,
        removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
        removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
        priority: priority ?? AGENT_PRIORITY['moderation-dispatcher'],
        deduplication: {
          id: `moderation_dispatcher_${postId}`,
          mode: 'debounce' as const,
          ttl: ONE_MINUTE_MS,
        },
      } satisfies JobOptions,
    )
    .catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'moderation-dispatcher')
}

export async function enqueueBulkModerationPrompts(
  items: Array<{ postId: string; moderatorSlug: string; source?: 'baseline' | 'community' }>,
): Promise<void> {
  if (items.length === 0) return
  const jobs = items.map(({ postId, moderatorSlug, source }) => ({
    name: 'moderation-prompt' as const,
    data: { id: postId, moderatorSlug, source } satisfies ModerationPromptJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['moderation-prompt'],
      deduplication: {
        id: `moderation_prompt_${postId}_${moderatorSlug}`,
        mode: 'debounce' as const,
        ttl: ONE_MINUTE_MS,
      },
    } satisfies JobOptions,
  }))
  await ai_agents.addBulk(jobs)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'moderation-prompt', items.length)
}
