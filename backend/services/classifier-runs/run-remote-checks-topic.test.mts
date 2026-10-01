import { randomUUID } from 'node:crypto'
import type {
  ClassifierDecisionInputResult,
  PersistedClassifierDecisionResult,
} from '@services/classifiers/types'
import {
  classifierId,
  globalScope,
  inputFor,
  leaseFor,
  persistedFor,
  persistedResult,
  promptVersionId,
} from '@voucha/test-helpers/classifier-run-remote-fixtures'
import { describe, expect, it } from 'vitest'
import {
  assertPersistedDecisionMatchesRun,
  assertRemoteInputCandidates,
  hasNoCapturedCandidates,
  remoteCandidateKind,
} from './run-remote-checks.mts'

const topicId = randomUUID()
const candidate = {
  topicId,
  candidateId: randomUUID(),
  thresholdId: randomUUID(),
  lower: 0.25,
  upper: 0.75,
}
const topicResult = (storedCandidateId: string | null): ClassifierDecisionInputResult => ({
  candidateKind: 'topic',
  topicId,
  storedCandidateId,
  probability: 0.5,
  rawResponse: {},
})
const topicPlan = (candidates: (typeof candidate)[], capturedCandidates: boolean) => ({
  candidateKind: 'topic' as const,
  classifierId,
  promptVersionId,
  scope: globalScope,
  candidates,
  capturedCandidates,
})
const topicInput = (results: ClassifierDecisionInputResult[]) =>
  inputFor(results, { scope: globalScope })
const topicDecision = (result: PersistedClassifierDecisionResult) =>
  persistedFor([result], { scope: globalScope })

describe('topic remote checks', () => {
  const pinned = leaseFor(topicPlan([candidate], false))

  it('pins stored candidates and their threshold revision for a pinned plan', () => {
    expect(remoteCandidateKind(pinned)).toBe('topic')
    expect(() =>
      assertRemoteInputCandidates(pinned, topicInput([topicResult(candidate.candidateId)])),
    ).not.toThrow()
    expect(() => assertRemoteInputCandidates(pinned, topicInput([topicResult(null)]))).toThrow(
      'lineage',
    )

    const matching = persistedResult(topicResult(candidate.candidateId), {
      thresholdId: candidate.thresholdId,
      scope: globalScope,
    })
    expect(() => assertPersistedDecisionMatchesRun(pinned, topicDecision(matching))).not.toThrow()
    for (const overrides of [
      { thresholdId: randomUUID() },
      { effectiveThresholds: { lower: 0.3, upper: 0.75 } },
      { effectiveThresholds: { lower: 0.25, upper: 0.8 } },
    ]) {
      expect(() =>
        assertPersistedDecisionMatchesRun(
          pinned,
          topicDecision({ ...matching, ...overrides } as PersistedClassifierDecisionResult),
        ),
      ).toThrow('lineage')
    }
  })

  it('judges a captured plan by the topics its receipt captured', () => {
    const captured = leaseFor(topicPlan([], true), [topicId])
    expect(hasNoCapturedCandidates(captured)).toBe(false)
    expect(hasNoCapturedCandidates({ ...captured, capturedTopicIds: [] })).toBe(true)
    expect(hasNoCapturedCandidates(pinned)).toBe(false)
    expect(() =>
      assertRemoteInputCandidates(captured, topicInput([topicResult(null)])),
    ).not.toThrow()
    expect(() =>
      assertRemoteInputCandidates(captured, topicInput([topicResult(randomUUID())])),
    ).toThrow('lineage')
  })
})
