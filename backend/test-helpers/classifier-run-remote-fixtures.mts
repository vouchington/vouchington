import { randomUUID } from 'node:crypto'
import type {
  ClassifierDecisionInputResult,
  ClassifierDecisionScope,
  PersistClassifierDecisionInput,
  PersistedClassifierDecision,
  PersistedClassifierDecisionResult,
} from '../services/classifiers/types.mts'
import type {
  ClassifierRunLease,
  RemotePlan,
  StoryRunCandidate,
} from '../services/classifier-runs/types.mts'

/** Pure builders for the receipt, the provider input and the persisted decision of one run. */
export const classifierId = randomUUID()
export const promptVersionId = randomUUID()
export const batchId = randomUUID()
export const callId = randomUUID()
export const communityId = randomUUID()
export const subject = { postId: randomUUID(), rssFeedItemId: null } as const
export const communityScope: ClassifierDecisionScope = {
  scopeCategory: 'community_ai',
  scopeCommunityId: communityId,
}
export const globalScope: ClassifierDecisionScope = {
  scopeCategory: 'global',
  scopeCommunityId: null,
}

export function leaseFor(
  remote: RemotePlan | null,
  capturedTopicIds: readonly string[] = [],
  capturedStoryCandidates: readonly StoryRunCandidate[] = [],
) {
  return {
    runId: randomUUID(),
    subject,
    inputSha256: Buffer.alloc(32),
    resolved: {
      configuration: {},
      configurationJson: '{}',
      configurationSha256: Buffer.alloc(32),
      actorId: randomUUID(),
      remote,
    },
    leaseToken: randomUUID(),
    decisionBatchId: batchId,
    capturedTopicIds,
    capturedStoryCandidates,
  } satisfies ClassifierRunLease<unknown>
}

export function inputFor(
  results: readonly ClassifierDecisionInputResult[],
  overrides: Partial<PersistClassifierDecisionInput> = {},
): PersistClassifierDecisionInput {
  return {
    batchId,
    classifierId,
    promptVersionId,
    scope: communityScope,
    subject,
    calls: [{ shardOrdinal: 0, results }],
    ...overrides,
  }
}

export function persistedResult(
  result: ClassifierDecisionInputResult,
  overrides: Record<string, unknown> = {},
) {
  return {
    ...result,
    id: randomUUID(),
    batchId,
    decisionCallId: callId,
    classifierId,
    promptVersionId,
    thresholdId: null,
    effectiveThresholds: { lower: 0.25, upper: 0.75 },
    scope: communityScope,
    ...overrides,
  } as PersistedClassifierDecisionResult
}

export function persistedFor(
  results: readonly PersistedClassifierDecisionResult[],
  overrides: Partial<PersistedClassifierDecision> = {},
): PersistedClassifierDecision {
  return {
    batchId,
    classifierId,
    promptVersionId,
    scope: communityScope,
    subject,
    calls: [{ id: callId, shardOrdinal: 0 }],
    results,
    ...overrides,
  }
}
