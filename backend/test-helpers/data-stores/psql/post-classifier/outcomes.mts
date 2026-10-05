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

/** A complete C3 decision for the run's reserved batch, all-positive or all-negative. */
export function remoteDecisionFor(
  setup: PostClassifierExecutionFixture,
  positive: boolean,
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
          probability: positive ? (question.upper + 1) / 2 : question.lower / 2,
          rawResponse: { type: 'noul', positive },
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
