import type { PersistClassifierDecisionInput } from '../../../../services/classifiers/types.mts'
import {
  getEntityRelations,
  SYSTEM_ENTITY_RELATION_VIEWER,
} from '../../../../services/entity-relations/index.mts'
import type { PostClassifierLocalOutcome } from '../../../../services/post-classifier/index.mts'
import type { PostClassifierExecutionFixture } from './execution.mts'

export function makePostClassifierLocalOutcome(
  is_flagged: boolean,
  confidenceThreshold: number,
): PostClassifierLocalOutcome {
  return {
    is_flagged,
    reason: is_flagged ? 'AI-generated' : 'Human-authored',
    confidenceScore: is_flagged ? 0.98 : 0.01,
    confidenceThreshold,
    classification: is_flagged ? 'ai' : 'human',
    detector: 'test-detector',
    detectorModelVersion: 'test-model',
  }
}

/** The local outcome the run's configuration asks for, or undefined for a remote-only run. */
export function localOutcomeFor(
  setup: PostClassifierExecutionFixture,
  is_flagged: boolean,
): PostClassifierLocalOutcome | undefined {
  const local = setup.lease.resolved.configuration.local
  return local ? makePostClassifierLocalOutcome(is_flagged, local.confidenceThreshold) : undefined
}

/** The probability that maps to +1 (`true`), -1 (`false`) or 0 (`'neutral'`) for these bounds. */
function probabilityFor(result: boolean | 'neutral', lower: number, upper: number): number {
  if (result === 'neutral') return (lower + upper) / 2
  return result ? (upper + 1) / 2 : lower / 2
}

/**
 * A complete C3 decision for the run's reserved batch where every question answers the same way:
 * positive (`true`, +1), negative (`false`, -1) or neutral (`'neutral'`, 0).
 */
export function remoteDecisionFor(
  setup: PostClassifierExecutionFixture,
  result: boolean | 'neutral',
): PersistClassifierDecisionInput | undefined {
  const remote = setup.lease.resolved.configuration.remote
  if (!remote || !setup.lease.decisionBatchId) return undefined
  return {
    batchId: setup.lease.decisionBatchId,
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    subject: { postId: setup.post.id, rssFeedItemId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: remote.questions.map(question => ({
          candidateKind: 'topic' as const,
          topicId: question.topicId,
          storedCandidateId: question.candidateId,
          probability: probabilityFor(result, question.lower, question.upper),
          rawResponse: { type: 'noul', result },
        })),
      },
    ],
  }
}

export function categoryRelationsForTest(postId: string) {
  return getEntityRelations('post', postId, 'category', 'topic', {
    viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    readOnly: false,
  })
}
