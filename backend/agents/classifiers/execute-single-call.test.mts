import { describe, expect, it } from 'vitest'
import type { PersistClassifierDecisionInput } from '@services/classifiers'
import { StructuredDecisionError } from '@modules/structured-decisions'
import { executeSingleCallClassifierDecision } from './execute-single-call.mts'
import { classifierChoiceKey, classifierPrompt } from './safe-content.mts'
import {
  configuration,
  makeClient,
  makeSingleCallInput,
  rssFeedItemId,
  storyAId,
  storyBId,
  topicAId,
  topicBId,
  threeNoulBindings,
} from './test-helpers.mts'

describe('executeSingleCallClassifierDecision', () => {
  it('sends every binding in exactly one request and persists once', async () => {
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

    await executeSingleCallClassifierDecision(makeSingleCallInput({ client }), {
      getActiveClassifierConfiguration: async () => configuration,
      persistClassifierDecision: async input => {
        persisted.push(input)
        return { decision: input as never, replayed: false }
      },
    })

    expect(client.requests).toHaveLength(1)
    expect(client.requests[0]?.questions).toHaveLength(2)
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

  it('maps each bound Choice criterion in the single request', async () => {
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
    const input = {
      ...makeSingleCallInput({ client }),
      subject: { postId: null, rssFeedItemId },
      bindings: [
        {
          type: 'choice' as const,
          questionId: 'stories',
          question: classifierPrompt`Which story applies?`,
          criteria: [
            {
              criterion: classifierChoiceKey('story-a'),
              candidate: {
                candidateKind: 'story' as const,
                storyId: storyAId,
                storedCandidateId: null,
              },
            },
            {
              criterion: classifierChoiceKey('story-b'),
              candidate: {
                candidateKind: 'story' as const,
                storyId: storyBId,
                storedCandidateId: null,
              },
            },
            { criterion: classifierChoiceKey('none'), candidate: null },
          ],
        },
      ],
    }

    await executeSingleCallClassifierDecision(input, {
      getActiveClassifierConfiguration: async () => ({
        ...configuration,
        primitive: 'choice',
        candidateKind: 'story',
      }),
      persistClassifierDecision: async value => {
        persisted.push(value)
        return { decision: value as never, replayed: false }
      },
    })

    expect(client.requests).toHaveLength(1)
    expect(persisted[0]?.calls[0]?.results).toEqual([
      expect.objectContaining({ storyId: storyAId, probability: 0.7 }),
      expect.objectContaining({ storyId: storyBId, probability: 0.2 }),
    ])
  })

  it('does not persist when the single provider call fails', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    const client = makeClient(() => {
      throw new StructuredDecisionError('provider-error', 'context too large', 413)
    })

    await expect(
      executeSingleCallClassifierDecision(
        makeSingleCallInput({ client, bindings: threeNoulBindings() }),
        {
          getActiveClassifierConfiguration: async () => configuration,
          persistClassifierDecision: async input => {
            persisted.push(input)
            return { decision: input as never, replayed: false }
          },
        },
      ),
    ).rejects.toThrow('context too large')
    expect(persisted).toEqual([])
  })

  it('rejects unsupported Score persistence before calling the provider', async () => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    await expect(
      executeSingleCallClassifierDecision(makeSingleCallInput({ client }), {
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
      executeSingleCallClassifierDecision(makeSingleCallInput({ client, batchId: 'not-a-uuid' }), {
        getActiveClassifierConfiguration: async () => configuration,
      }),
    ).rejects.toThrow('UUIDv7')
    expect(client.requests).toEqual([])
  })

  it('accepts an input with no context policy at all', () => {
    const input = makeSingleCallInput({})
    expect(input).not.toHaveProperty('contextPolicy')
  })
})
