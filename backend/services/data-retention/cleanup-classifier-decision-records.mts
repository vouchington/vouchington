import { sweepClassifierDefaultChildren } from './cleanup-classifier-default-children.mts'
import {
  deleteOldClassifierBatches,
  deleteOldClassifierCalls,
} from './cleanup-classifier-decisions.mts'
import { sweepClassifierPages } from './cleanup-classifier-pages.mts'

type CleanupCount = { deleted: number; hasMore: boolean; scanned: number }

/** Clear expired DEFAULT results, then snapshots and parents in FK order. */
export async function cleanupClassifierDecisionRecords(
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
  maxBatches: number,
  activeSweeps?: readonly string[],
): Promise<{
  topicResults: CleanupCount
  storyResults: CleanupCount
  communityPromptResults: CleanupCount
  decisionCandidates: CleanupCount
  calls: CleanupCount
  batches: CleanupCount
}> {
  const active = (sweep: string) => activeSweeps === undefined || activeSweeps.includes(sweep)
  const skip = { scanned: 0, deleted: 0, hasMore: false }
  const [topicResults, storyResults, communityPromptResults] = await Promise.all([
    active('topicResults')
      ? sweepClassifierDefaultChildren(
          'topic_results',
          cutoffId,
          lowerBoundId,
          batchSize,
          maxBatches,
        )
      : skip,
    active('storyResults')
      ? sweepClassifierDefaultChildren(
          'story_results',
          cutoffId,
          lowerBoundId,
          batchSize,
          maxBatches,
        )
      : skip,
    active('communityPromptResults')
      ? sweepClassifierDefaultChildren(
          'community_prompt_results',
          cutoffId,
          lowerBoundId,
          batchSize,
          maxBatches,
        )
      : skip,
  ])
  const decisionCandidates = active('decisionCandidates')
    ? await sweepClassifierDefaultChildren(
        'decision_candidates',
        cutoffId,
        lowerBoundId,
        batchSize,
        maxBatches,
      )
    : skip
  const calls = active('calls')
    ? await sweepClassifierPages(
        'calls',
        cutoffId,
        lowerBoundId,
        batchSize,
        maxBatches,
        deleteOldClassifierCalls,
      )
    : skip
  const batches = active('batches')
    ? await sweepClassifierPages(
        'batches',
        cutoffId,
        lowerBoundId,
        batchSize,
        maxBatches,
        deleteOldClassifierBatches,
      )
    : skip
  return { topicResults, storyResults, communityPromptResults, decisionCandidates, calls, batches }
}
