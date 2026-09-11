import type { JobOptions } from 'glide-mq'
import { createHash } from 'node:crypto'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { WikipediaRecommenderJobData } from '../types.mts'
import type { SourceEntityType } from '@voucha/types/entities/wikipedia-topic-recommendation'

export function enqueueBulkWikipediaRecommender(
  items: Array<{ entityType: SourceEntityType; entityIds: string[] }>,
  priority?: number,
): Promise<void> {
  if (items.length === 0) return Promise.resolve()
  const jobs = items.map(({ entityType, entityIds }) => ({
    name: 'wikipedia-recommender' as const,
    data: { entity_type: entityType, entity_ids: entityIds } satisfies WikipediaRecommenderJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: priority ?? AGENT_PRIORITY['wikipedia-recommender'],
      deduplication: {
        id: `wikipedia_recommender_${entityType}_${createHash('sha256')
          .update(entityIds.toSorted().join('\0'))
          .digest('hex')}`,
        mode: 'debounce' as const,
        ttl: 60_000,
      },
    } satisfies JobOptions,
  }))
  return ai_agents
    .addBulk(jobs)
    .then(() => {
      trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'wikipedia-recommender', items.length)
      return undefined
    })
    .catch(onError)
}
