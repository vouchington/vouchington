import { describe, expect, it } from 'vitest'
import {
  computeAutotaggerReceiptDigest,
  type AutotaggerReceiptDigestInput,
} from './receipt-digest.mts'

function baseInput(): AutotaggerReceiptDigestInput {
  return {
    state: 'a post body',
    questions: [
      { questionId: 'q1', question: 'Is this about topic A?', candidateId: 'topic-a' },
      { questionId: 'q2', question: 'Is this about topic B?', candidateId: 'topic-b' },
    ],
    scopeCategory: 'global',
    scopeCommunityId: null,
    effectiveCap: 5,
    classifierId: 'classifier-1',
    promptVersionId: 'prompt-1',
    modelProvider: 'typesafe',
    modelName: 'typesafe/jev-1.13',
  }
}

describe('computeAutotaggerReceiptDigest', () => {
  it('is stable across repeated calls with identical input', () => {
    const first = computeAutotaggerReceiptDigest(baseInput())
    const second = computeAutotaggerReceiptDigest(baseInput())
    expect(first.equals(second)).toBe(true)
  })

  it('is order-independent over the candidate question set', () => {
    const input = baseInput()
    const forward = computeAutotaggerReceiptDigest(input)
    const reversed = computeAutotaggerReceiptDigest({
      ...input,
      questions: [...input.questions].reverse(),
    })
    expect(forward.equals(reversed)).toBe(true)
  })

  it('is stable for a permutation of more than two candidates', () => {
    const input: AutotaggerReceiptDigestInput = {
      ...baseInput(),
      questions: [
        { questionId: 'q1', question: 'Is this about topic A?', candidateId: 'topic-a' },
        { questionId: 'q2', question: 'Is this about topic B?', candidateId: 'topic-b' },
        { questionId: 'q3', question: 'Is this about topic C?', candidateId: 'topic-c' },
      ],
    }
    const inOrder = computeAutotaggerReceiptDigest(input)
    const shuffled = computeAutotaggerReceiptDigest({
      ...input,
      questions: [input.questions[2]!, input.questions[0]!, input.questions[1]!],
    })
    expect(inOrder.equals(shuffled)).toBe(true)
  })

  it.each([
    ['state', (i: AutotaggerReceiptDigestInput) => ({ ...i, state: 'a different post body' })],
    [
      'a question id',
      (i: AutotaggerReceiptDigestInput) => ({
        ...i,
        questions: [{ ...i.questions[0]!, questionId: 'different' }, i.questions[1]!],
      }),
    ],
    [
      'a question candidate id',
      (i: AutotaggerReceiptDigestInput) => ({
        ...i,
        questions: [{ ...i.questions[0]!, candidateId: 'different-topic' }, i.questions[1]!],
      }),
    ],
    [
      'a question text',
      (i: AutotaggerReceiptDigestInput) => ({
        ...i,
        questions: [{ ...i.questions[0]!, question: 'different?' }, i.questions[1]!],
      }),
    ],
    [
      'the candidate set size',
      (i: AutotaggerReceiptDigestInput) => ({ ...i, questions: [i.questions[0]!] }),
    ],
    [
      'scopeCategory',
      (i: AutotaggerReceiptDigestInput) => ({
        ...i,
        scopeCategory: 'community_ai' as const,
        scopeCommunityId: 'community-1',
      }),
    ],
    ['effectiveCap', (i: AutotaggerReceiptDigestInput) => ({ ...i, effectiveCap: 6 })],
    ['classifierId', (i: AutotaggerReceiptDigestInput) => ({ ...i, classifierId: 'classifier-2' })],
    [
      'promptVersionId',
      (i: AutotaggerReceiptDigestInput) => ({ ...i, promptVersionId: 'prompt-2' }),
    ],
    ['modelProvider', (i: AutotaggerReceiptDigestInput) => ({ ...i, modelProvider: 'other' })],
    ['modelName', (i: AutotaggerReceiptDigestInput) => ({ ...i, modelName: 'other/model' })],
  ])('changes when %s changes', (_label, mutate) => {
    const original = computeAutotaggerReceiptDigest(baseInput())
    const mutated = computeAutotaggerReceiptDigest(mutate(baseInput()))
    expect(mutated.equals(original)).toBe(false)
  })

  it('produces a 32-byte sha256 digest', () => {
    const digest = computeAutotaggerReceiptDigest(baseInput())
    expect(digest).toBeInstanceOf(Buffer)
    expect(digest).toHaveLength(32)
  })
})
