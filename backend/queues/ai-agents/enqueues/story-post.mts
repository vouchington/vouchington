import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { StoryPostJobData } from '../types.mts'

export function enqueueStoryPostAgent(
  post_id: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const jobData: StoryPostJobData = { post_id, force: opts.force }
  // When forcing a refresh, use a unique dedup id so this run isn't collapsed with an
  // in-flight backfill job (which uses the stable `story_post_agent_${post_id}` id).
  // We use crypto.randomUUID() — available in Node 15+ — for a collision-free suffix.
  const dedupId = opts.force
    ? `story_post_agent_refresh_${post_id}_${crypto.randomUUID()}`
    : `story_post_agent_${post_id}`
  const enqueue = ai_agents
    .add('story-post', jobData, {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['story-post'],
      deduplication: {
        id: dedupId,
        mode: 'simple' as const,
      },
    })
    .then(() => undefined)
  void enqueue.catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'story-post', 1)
  return enqueue
}
