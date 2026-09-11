// API-facing entity types — canonical definitions live in @voucha/types/entities/topic
export type {
  TopicTypes,
  Topic,
  TopicMetrics,
  TopicRatingStats,
} from '@voucha/types/entities/topic'

// Relocated to @queues/entity-listeners (pure type, no runtime logic) so that package's enqueue
// job-data shape doesn't require depending on @services/topics, which already depends on
// @queues/entity-listeners for real enqueue calls (avoids a workspace cycle).
export type { CreateTopicUpdates } from '@queues/entity-listeners/types'
