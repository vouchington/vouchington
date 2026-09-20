import { describe, expect, it } from 'vitest'
import type {
  ActiveClassifierConfiguration,
  PersistClassifierDecisionInput,
} from '@services/classifiers'
import { executeClassifierDecision } from './execute.mts'
import { classifierChoiceKey, classifierPrompt } from './safe-content.mts'
import {
  configuration,
  makeClient,
  makeInput,
  rssFeedItemId,
  storyAId,
  storyBId,
  storyCandidate,
  topicAId,
  topicBId,
  threeNoulBindings,
} from './test-helpers.mts'
import type { ClassifierContextPolicy, ExecuteClassifierDecisionInput } from './types.mts'

describe('executeClassifierDecision', () => {
  it('maps Noul answers and persists once after all candidate coverage is complete', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    const client = makeClient(request => ({
      answers: request.questions.map(question => ({
        id: question.id,
        type: 'noul' as const,
        probability: question.id === 'candidate-a' ? 0.8 : 0.2,
        raw: { id: question.id, type: 'noul' },
      })),
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      raw: {},
      usage: null,
    }))

    await executeClassifierDecision(makeInput({ client }), {
      getActiveClassifierConfiguration: async () => configuration,
      persistClassifierDecision: async input => {
        persisted.push(input)
        return { decision: input as never, replayed: false }
      },
    })

    expect(client.requests).toHaveLength(1)
    expect(persisted).toEqual([
      expect.objectContaining({
        batchId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586ef9',
        classifierId: configuration.classifierId,
        promptVersionId: configuration.promptVersionId,
        calls: [
          {
            shardOrdinal: 0,
            results: [
              expect.objectContaining({ topicId: topicAId, probability: 0.8 }),
              expect.objectContaining({ topicId: topicBId, probability: 0.2 }),
            ],
          },
        ],
      }),
    ])
  })

  it('maps each bound Choice criterion while excluding an unbound none criterion', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    const client = makeClient(request => ({
      answers: request.questions.map(question => ({
        id: question.id,
        type: 'choice' as const,
        choice: 'story-a',
        confidence: 0.7,
        probabilities: { 'story-a': 0.7, 'story-b': 0.2, none: 0.1 },
        raw: { id: question.id, type: 'choice' },
      })),
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      raw: {},
      usage: null,
    }))
    const input: ExecuteClassifierDecisionInput = {
      ...makeInput({ client }),
      subject: { postId: null, rssFeedItemId },
      bindings: [
        {
          type: 'choice',
          questionId: 'stories',
          question: classifierPrompt`Which story applies?`,
          criteria: [
            {
              criterion: classifierChoiceKey('story-a'),
              candidate: { candidateKind: 'story', storyId: storyAId, storedCandidateId: null },
            },
            {
              criterion: classifierChoiceKey('story-b'),
              candidate: { candidateKind: 'story', storyId: storyBId, storedCandidateId: null },
            },
            { criterion: classifierChoiceKey('none'), candidate: null },
          ],
        },
      ],
    }
    const storyConfiguration: ActiveClassifierConfiguration = {
      ...configuration,
      primitive: 'choice',
      candidateKind: 'story',
    }

    await executeClassifierDecision(input, {
      getActiveClassifierConfiguration: async () => storyConfiguration,
      persistClassifierDecision: async value => {
        persisted.push(value)
        return { decision: value as never, replayed: false }
      },
    })

    expect(persisted[0]?.calls[0]?.results).toEqual([
      expect.objectContaining({ storyId: storyAId, probability: 0.7 }),
      expect.objectContaining({ storyId: storyBId, probability: 0.2 }),
    ])
  })

  it('does not persist when a later shard fails', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    let callCount = 0
    const client = makeClient(request => {
      callCount += 1
      if (callCount === 2) throw new Error('provider failed')
      return {
        answers: request.questions.map(question => ({
          id: question.id,
          type: 'noul' as const,
          probability: 0.5,
          raw: { id: question.id, type: 'noul' },
        })),
        model: 'typesafe/jev-1.13',
        provider: 'TypeSafe',
        raw: {},
        usage: null,
      }
    })
    const policy: ClassifierContextPolicy = {
      transport: 'openrouter',
      model: 'typesafe/jev-1.13',
      measure: request => ({ totalTokens: request.questions.length * 20_000 }),
    }

    await expect(
      executeClassifierDecision(
        makeInput({ client, contextPolicy: policy, bindings: threeNoulBindings() }),
        {
          getActiveClassifierConfiguration: async () => ({
            ...configuration,
            modelProvider: 'openrouter',
          }),
          persistClassifierDecision: async input => {
            persisted.push(input)
            return { decision: input as never, replayed: false }
          },
        },
      ),
    ).rejects.toThrow('provider failed')
    expect(persisted).toEqual([])
  })

  it('rejects unsupported Score persistence before calling the provider', async () => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    await expect(
      executeClassifierDecision(makeInput({ client }), {
        getActiveClassifierConfiguration: async () => ({ ...configuration, primitive: 'score' }),
      }),
    ).rejects.toThrow('Score persistence')
    expect(client.requests).toEqual([])
  })

  it('rejects a non-UUIDv7 batch ID before calling the provider', async () => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    await expect(
      executeClassifierDecision(makeInput({ client, batchId: 'not-a-uuid' }), {
        getActiveClassifierConfiguration: async () => configuration,
      }),
    ).rejects.toThrow('UUIDv7')
    expect(client.requests).toEqual([])
  })

  it('rejects an empty concrete candidate ID before calling the provider', async () => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    const invalidBinding = {
      ...threeNoulBindings()[0]!,
      candidate: { candidateKind: 'topic' as const, topicId: ' ', storedCandidateId: null },
    }
    await expect(
      executeClassifierDecision(makeInput({ client, bindings: [invalidBinding] }), {
        getActiveClassifierConfiguration: async () => configuration,
      }),
    ).rejects.toThrow('durable IDs must be UUIDs')
    expect(client.requests).toEqual([])
  })

  it('rejects a prompt cutover before calling the provider', async () => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    await expect(
      executeClassifierDecision(makeInput({ client }), {
        getActiveClassifierConfiguration: async () => ({
          ...configuration,
          promptVersionId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0b',
        }),
      }),
    ).rejects.toThrow('prompt version changed')
    expect(client.requests).toEqual([])
  })

  it.each([
    [
      'one criterion',
      [{ criterion: classifierChoiceKey('story-a'), candidate: storyCandidate(storyAId) }],
    ],
    [
      'two unbound criteria',
      [
        { criterion: classifierChoiceKey('story-a'), candidate: storyCandidate(storyAId) },
        { criterion: classifierChoiceKey('none'), candidate: null },
        { criterion: classifierChoiceKey('other'), candidate: null },
      ],
    ],
    [
      'an external-text criterion',
      [
        {
          criterion: 'story a' as ReturnType<typeof classifierChoiceKey>,
          candidate: storyCandidate(storyAId),
        },
        { criterion: classifierChoiceKey('none'), candidate: null },
      ],
    ],
  ])('rejects Choice bindings with %s before calling the provider', async (_name, criteria) => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    await expect(
      executeClassifierDecision(
        {
          ...makeInput({ client }),
          subject: { postId: null, rssFeedItemId },
          bindings: [
            {
              type: 'choice',
              questionId: 'stories',
              question: classifierPrompt`Which story applies?`,
              criteria,
            },
          ],
        },
        {
          getActiveClassifierConfiguration: async () => ({
            ...configuration,
            primitive: 'choice',
            candidateKind: 'story',
          }),
        },
      ),
    ).rejects.toThrow(/at least two criteria|at most one unbound criterion|opaque keys/)
    expect(client.requests).toEqual([])
  })
})
