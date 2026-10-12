import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'
import type { ElectionsJobData } from './enqueues/types-elections.mts'
import type { VoteWeightJobData } from './enqueues/types-vote-weight.mts'
import type { VoteIntegrityJobData } from './enqueues/types-vote-integrity.mts'
import type { TopicRatingsJobData } from './enqueues/types-topic-ratings.mts'
import type { ReportIntegrityJobData } from './enqueues/types-report-integrity.mts'

type VoteAggregationJobData =
  | ElectionsJobData['data']
  | VoteWeightJobData['data']
  | VoteIntegrityJobData['data']
  | TopicRatingsJobData['data']
  | ReportIntegrityJobData['data']
  | { id: string }

export const voteAggregation = createQueue<VoteAggregationJobData>(QUEUE_NAME, {
  priorityKind: 'ranked',
})
