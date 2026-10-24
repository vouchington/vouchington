import { describe, expect, it } from 'vitest'
import { prepareSingleCallClassifierDecision } from './prepare-single-call.mts'
import { classifierChoiceKey, classifierPrompt } from './safe-content.mts'
import {
  configuration,
  makeClient,
  makeInput,
  rssFeedItemId,
  storyAId,
  storyCandidate,
} from '@voucha/test-helpers/agents/classifiers/fixtures'

describe('classifier preparation input dispatch guards', () => {
  it('rejects an empty concrete candidate ID before calling the provider', async () => {
    const client = makeClient(() => {
      throw new Error('should not call')
    })
    const invalidBinding = {
      ...makeInput({}).bindings[0]!,
      candidate: { candidateKind: 'topic' as const, topicId: ' ', storedCandidateId: null },
    }
    await expect(
      prepareSingleCallClassifierDecision(makeInput({ client, bindings: [invalidBinding] }), {
        getActiveClassifierConfiguration: async () => configuration,
      }),
    ).rejects.toThrow('durable IDs must be UUIDs')
    expect(client.requests).toEqual([])
  })

  it.each([
    [
      'one criterion',
      [{ criterion: classifierChoiceKey('story-a'), candidate: storyCandidate(storyAId) }],
      'Choice classifier bindings require at least two criteria',
    ],
    [
      'two unbound criteria',
      [
        { criterion: classifierChoiceKey('story-a'), candidate: storyCandidate(storyAId) },
        { criterion: classifierChoiceKey('none'), candidate: null },
        { criterion: classifierChoiceKey('other'), candidate: null },
      ],
      'Choice classifier bindings allow at most one unbound criterion',
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
      'Choice classifier criteria must be unique opaque keys',
    ],
  ])(
    'rejects Choice bindings with %s before calling the provider',
    async (_name, criteria, error) => {
      const client = makeClient(() => {
        throw new Error('should not call')
      })
      await expect(
        prepareSingleCallClassifierDecision(
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
      ).rejects.toThrow(error)
      expect(client.requests).toEqual([])
    },
  )
})
