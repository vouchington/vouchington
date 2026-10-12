import { updateTopicRatingStats } from '@services/topics'
import { refresh } from '@services/entity-fetch/refresh'
import { refreshUserMetricsCache } from '@services/entity-fetch/metrics'
import type { Job } from 'glide-mq'
import { processElection } from './processors/elections.mts'
import {
  processRecalculateUserVoteWeight,
  processRecalculateVoteWeightDispatcher,
} from './processors/vote-weight.mts'
import { processVoteIntegrityCheck } from './processors/vote-integrity.mts'
import {
  processBackfillReportIntegrity,
  processReportIntegrityCheck,
} from './processors/report-integrity.mts'

export async function processVoteAggregationJob(job: Job): Promise<void> {
  switch (job.name) {
    case 'processUpdateElectionVoteStats':
      await processElection(job)
      return
    case 'processRecalculateUserVoteWeight':
      await processRecalculateUserVoteWeight(job.data)
      return
    case 'processRecalculateVoteWeightDispatcher':
      await processRecalculateVoteWeightDispatcher(job.data)
      return
    case 'processVoteIntegrityCheck':
      await processVoteIntegrityCheck(job.data)
      return
    case 'processUpdateTopicRatingStats':
      await updateTopicRatingStats(job.data.topicId)
      return
    case 'processRefreshTopicMetrics':
      await refresh.topic_metrics(job.data.id)
      return
    case 'processRefreshPostMetrics':
      await refresh.post_metrics(job.data.id)
      return
    case 'processRefreshUserMetrics':
      await refreshUserMetricsCache(job.data.id)
      return
    case 'processReportIntegrityCheck':
      await processReportIntegrityCheck(job.data)
      return
    case 'backfill_report_integrity':
      await processBackfillReportIntegrity()
      return
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}
