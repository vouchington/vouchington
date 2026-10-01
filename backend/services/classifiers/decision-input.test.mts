import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  classifierDecisionCandidateKind,
  classifierDecisionEntityId,
  classifierDecisionResultKey,
  flattenClassifierDecisionResults,
  normalizeClassifierDecisionInput,
  serializeClassifierRawResponse,
} from './decision-input.mts'
import type { PersistClassifierDecisionInput, TopicClassifierDecisionResult } from './types.mts'

function createInput(): PersistClassifierDecisionInput {
  return {
    batchId: uuidv7(),
    classifierId: uuidv7(),
    promptVersionId: uuidv7(),
    subject: { postId: uuidv7(), rssFeedItemId: null },
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'topic',
            topicId: uuidv7(),
            storedCandidateId: uuidv7(),
            probability: 0.5,
            rawResponse: { probability: 0.5, type: 'noul' },
          },
        ],
      },
    ],
  }
}

describe('normalizeClassifierDecisionInput', () => {
  it.each([
    [
      'batch ID',
      (input: PersistClassifierDecisionInput) => ({
        ...input,
        batchId: '00000000-0000-4000-8000-000000000000',
      }),
      'batch ID must be UUIDv7',
    ],
    [
      'durable ID',
      (input: PersistClassifierDecisionInput) => ({ ...input, classifierId: 'invalid' }),
      'durable IDs must be UUIDs',
    ],
    [
      'empty calls',
      (input: PersistClassifierDecisionInput) => ({ ...input, calls: [] }),
      'at least one provider call',
    ],
  ])('rejects an invalid %s', (_name, change, message) => {
    expect(() => normalizeClassifierDecisionInput(change(createInput()))).toThrow(message)
  })

  it('requires exactly one subject', () => {
    const input = createInput()
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        subject: { postId: input.subject.postId!, rssFeedItemId: uuidv7() },
      } as unknown as PersistClassifierDecisionInput),
    ).toThrow('exactly one subject')
  })

  it('rejects malformed result entity and stored-candidate identifiers', () => {
    const input = createInput()
    const result = input.calls[0]!.results[0]! as TopicClassifierDecisionResult
    for (const invalid of [
      { ...result, topicId: 'invalid' },
      { ...result, storedCandidateId: 'invalid' },
    ]) {
      expect(() =>
        normalizeClassifierDecisionInput({
          ...input,
          calls: [{ shardOrdinal: 0, results: [invalid] }],
        }),
      ).toThrow('durable IDs must be UUIDs')
    }
  })

  it('enforces scope and community consistency', () => {
    const input = createInput()
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        scope: { scopeCategory: 'global', scopeCommunityId: uuidv7() },
      } as unknown as PersistClassifierDecisionInput),
    ).toThrow('cannot name a community')
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        scope: { scopeCategory: 'community_ai', scopeCommunityId: '' },
      }),
    ).toThrow('require a community')
  })

  it('requires consecutive non-empty shards', () => {
    const input = createInput()
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        calls: [{ ...input.calls[0]!, shardOrdinal: 1 }],
      }),
    ).toThrow('consecutive non-empty shard ordinals')
    expect(() =>
      normalizeClassifierDecisionInput({ ...input, calls: [{ shardOrdinal: 0, results: [] }] }),
    ).toThrow('consecutive non-empty shard ordinals')
  })

  it('rejects mixed, duplicate, and multiply stored candidates', () => {
    const input = createInput()
    const topic = input.calls[0]!.results[0]! as TopicClassifierDecisionResult
    const story = {
      candidateKind: 'story' as const,
      storyId: uuidv7(),
      storedCandidateId: null,
      probability: 0.4,
      rawResponse: {},
    }
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        calls: [{ shardOrdinal: 0, results: [topic, story] }],
      }),
    ).toThrow('cannot mix candidate kinds')
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        calls: [{ shardOrdinal: 0, results: [topic, topic] }],
      }),
    ).toThrow('cannot duplicate a candidate result')
    expect(() =>
      normalizeClassifierDecisionInput({
        ...input,
        calls: [
          {
            shardOrdinal: 0,
            results: [topic, { ...topic, topicId: uuidv7() }],
          },
        ],
      }),
    ).toThrow('cannot duplicate a stored candidate')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1])(
    'rejects invalid probability %s',
    probability => {
      const input = createInput()
      expect(() =>
        normalizeClassifierDecisionInput({
          ...input,
          calls: [
            {
              shardOrdinal: 0,
              results: [{ ...input.calls[0]!.results[0]!, probability }],
            },
          ],
        }),
      ).toThrow('probability must be between zero and one')
    },
  )

  it('returns a normalized valid input', () => {
    const input = createInput()
    expect(normalizeClassifierDecisionInput(input)).toBe(input)
  })
})

describe('classifier decision helpers', () => {
  it('derives and flattens result identities for both candidate families', () => {
    const topicInput = normalizeClassifierDecisionInput(createInput())
    const storyId = uuidv7()
    const storyInput = normalizeClassifierDecisionInput({
      ...createInput(),
      subject: { postId: null, rssFeedItemId: uuidv7() },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'story',
              storyId,
              storedCandidateId: null,
              probability: 0.5,
              rawResponse: {},
            },
          ],
        },
      ],
    })
    expect(classifierDecisionCandidateKind(topicInput)).toBe('topic')
    expect(classifierDecisionCandidateKind(storyInput)).toBe('story')
    expect(flattenClassifierDecisionResults(storyInput)).toHaveLength(1)
    expect(classifierDecisionResultKey(storyInput.calls[0]!.results[0]!)).toBe(`story:${storyId}`)
  })

  it('keys a community prompt result by its prompt id and rejects mixing it with another kind', () => {
    const input = createInput()
    const prompt = {
      candidateKind: 'community_prompt' as const,
      communityPromptId: uuidv7(),
      storedCandidateId: null,
      probability: 0.9,
      rawResponse: {},
    }
    expect(classifierDecisionEntityId(prompt)).toBe(prompt.communityPromptId)
    expect(classifierDecisionResultKey(prompt)).toBe(`community_prompt:${prompt.communityPromptId}`)
    const promptInput = {
      ...input,
      scope: { scopeCategory: 'community_ai' as const, scopeCommunityId: uuidv7() },
      calls: [{ shardOrdinal: 0, results: [prompt] }],
    }
    expect(classifierDecisionCandidateKind(normalizeClassifierDecisionInput(promptInput))).toBe(
      'community_prompt',
    )
    expect(() =>
      normalizeClassifierDecisionInput({
        ...promptInput,
        calls: [{ shardOrdinal: 0, results: [prompt, input.calls[0]!.results[0]!] }],
      }),
    ).toThrow('cannot mix candidate kinds')
    expect(() =>
      normalizeClassifierDecisionInput({
        ...promptInput,
        calls: [{ shardOrdinal: 0, results: [{ ...prompt, communityPromptId: 'not-a-uuid' }] }],
      }),
    ).toThrow('durable IDs must be UUIDs')
  })

  it('rejects candidate-kind lookup without a result', () => {
    expect(() => classifierDecisionCandidateKind({ calls: [] })).toThrow('candidate result')
  })

  it('serializes JSON recursively with stable object key order', () => {
    expect(serializeClassifierRawResponse({ z: [2, null], a: { y: true, x: 'value' } })).toBe(
      '{"a":{"x":"value","y":true},"z":[2,null]}',
    )
  })

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, undefined, () => undefined])(
    'rejects a non-JSON value',
    value => {
      expect(() => serializeClassifierRawResponse(value)).toThrow('JSON serializable')
    },
  )
})
