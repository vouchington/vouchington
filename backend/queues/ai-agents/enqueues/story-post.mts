import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { StoryPostJobData } from '../types.mts'

function buildStoryPostJob(
  post_id: string,
  force: boolean | undefined,
): { data: StoryPostJobData; opts: JobOptions } {
  // When forcing a refresh, use a unique dedup id so this run isn't collapsed with an
  // in-flight backfill job (which uses the stable `story_post_agent_${post_id}` id).
  // We use crypto.randomUUID() — available in Node 15+ — for a collision-free suffix.
  const dedupId = force
    ? `story_post_agent_refresh_${post_id}_${crypto.randomUUID()}`
    : `story_post_agent_${post_id}`
  return {
    data: { post_id, force },
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['story-post'],
      deduplication: {
        id: dedupId,
        mode: 'simple' as const,
      },
    },
  }
}

export function enqueueStoryPostAgent(
  post_id: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const job = buildStoryPostJob(post_id, opts.force)
  const enqueue = ai_agents.add('story-post', job.data, job.opts).then(() => undefined)
  void enqueue.catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'story-post', 1)
  return enqueue
}

const enqueueStoryPostAgentBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'story-post',
  buildJob: (input: { postId: string; force?: boolean }) =>
    buildStoryPostJob(input.postId, input.force),
})

/** Queues the story-post agent for each post in one call; an empty list adds nothing. */
export function enqueueBulkStoryPostAgents(
  postIds: readonly string[],
  opts: { force?: boolean } = {},
): Promise<unknown> {
  return enqueueStoryPostAgentBatch(postIds.map(postId => ({ postId, force: opts.force })))
}
