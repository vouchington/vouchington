import { randomUUID } from 'node:crypto'
import type {
  ClassifierDecisionInputResult,
  PersistClassifierDecisionInput,
} from '@services/classifiers/types'
import {
  classifierId,
  communityScope,
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
  assertRemoteInputIdentity,
  hasNoCapturedCandidates,
  remoteCandidateKind,
} from './run-remote-checks.mts'

const promptA = randomUUID()
const promptB = randomUUID()
const lease = leaseFor({
  candidateKind: 'community_prompt',
  classifierId,
  promptVersionId,
  scope: communityScope,
  promptIds: [promptA, promptB],
})

const promptResult = (communityPromptId: string): ClassifierDecisionInputResult => ({
  candidateKind: 'community_prompt',
  communityPromptId,
  storedCandidateId: null,
  probability: 0.9,
  rawResponse: {},
})
const complete = [promptResult(promptA), promptResult(promptB)]
const topicResult: ClassifierDecisionInputResult = {
  candidateKind: 'topic',
  topicId: promptB,
  storedCandidateId: null,
  probability: 1,
  rawResponse: {},
}

describe('community prompt remote checks', () => {
  it('reports the plan candidate kind and rejects a local-only run', () => {
    expect(remoteCandidateKind(lease)).toBe('community_prompt')
    expect(() => remoteCandidateKind(leaseFor(null))).toThrow('Local-only classifier run')
    expect(hasNoCapturedCandidates(lease)).toBe(false)
  })

  it('accepts exactly the pinned prompts, once each, under the community scope', () => {
    expect(() => assertRemoteInputIdentity(lease, inputFor(complete))).not.toThrow()
    expect(() => assertRemoteInputCandidates(lease, inputFor(complete))).not.toThrow()
    expect(() =>
      assertPersistedDecisionMatchesRun(lease, persistedFor(complete.map(r => persistedResult(r)))),
    ).not.toThrow()
  })

  it('rejects an input for another batch, classifier, prompt, subject or scope', () => {
    for (const overrides of [
      { batchId: randomUUID() },
      { classifierId: randomUUID() },
      { promptVersionId: randomUUID() },
      { subject: { postId: randomUUID(), rssFeedItemId: null } },
      { scope: globalScope },
      { scope: { scopeCategory: 'community_ai', scopeCommunityId: randomUUID() } as const },
    ] satisfies Partial<PersistClassifierDecisionInput>[]) {
      expect(() => assertRemoteInputIdentity(lease, inputFor(complete, overrides))).toThrow(
        'does not match its receipt',
      )
    }
  })

  it('rejects partial, extra, duplicate, foreign and wrong-kind results', () => {
    const cover = 'does not cover its exact reserved candidates'
    const lineage = 'candidate lineage does not match its receipt'
    const check = (results: ClassifierDecisionInputResult[], message: string) =>
      expect(() => assertRemoteInputCandidates(lease, inputFor(results))).toThrow(message)

    check([promptResult(promptA)], cover)
    check([...complete, promptResult(randomUUID())], cover)
    check([promptResult(promptA), promptResult(promptA)], lineage)
    check([promptResult(promptA), promptResult(randomUUID())], lineage)
    check([promptResult(promptA), topicResult], lineage)
    expect(() => assertRemoteInputCandidates(lease, inputFor([], { calls: [] }))).toThrow(cover)
    expect(() =>
      assertRemoteInputCandidates(
        lease,
        inputFor(complete, {
          calls: [
            { shardOrdinal: 0, results: [promptResult(promptA)] },
            { shardOrdinal: 1, results: [promptResult(promptB)] },
          ],
        }),
      ),
    ).toThrow(cover)
  })

  it('rejects a persisted decision with different identity, coverage or lineage', () => {
    const persisted = complete.map(result => persistedResult(result))
    const identity = 'decision identity does not match its receipt'
    const cover = 'decision does not cover its exact reserved candidates'
    const lineage = 'decision lineage does not match its receipt'
    const check = (decision: ReturnType<typeof persistedFor>, message: string) =>
      expect(() => assertPersistedDecisionMatchesRun(lease, decision)).toThrow(message)

    check(persistedFor(persisted, { scope: globalScope }), identity)
    check(persistedFor(persisted.slice(0, 1)), cover)
    check(
      persistedFor(persisted, {
        calls: [
          { id: persisted[0]!.decisionCallId, shardOrdinal: 0 },
          { id: randomUUID(), shardOrdinal: 1 },
        ],
      }),
      cover,
    )
    for (const overrides of [
      { decisionCallId: randomUUID() },
      { batchId: randomUUID() },
      { classifierId: randomUUID() },
      { promptVersionId: randomUUID() },
      { scope: globalScope },
    ]) {
      check(persistedFor([persistedResult(complete[0]!, overrides), persisted[1]!]), lineage)
    }
    check(persistedFor([persisted[0]!, persistedResult(promptResult(randomUUID()))]), lineage)
    check(persistedFor([persisted[0]!, persisted[0]!]), lineage)
  })
})
