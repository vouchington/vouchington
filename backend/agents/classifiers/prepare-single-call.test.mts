import { describe, expect, it } from 'vitest'
import type {
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from '@modules/structured-decisions'
import { prepareSingleCallClassifierDecision } from './prepare-single-call.mts'
import {
  configuration,
  makeClient,
  makeSingleCallInput,
  storedCandidateAId,
  topicAId,
  topicBId,
} from './test-helpers.mts'

describe('prepareSingleCallClassifierDecision', () => {
  it('prepares full persisted lineage with exactly one provider call and no persistence dependency', async () => {
    const client = makeClient(request => ({
      answers: request.questions.map(question => ({
        id: question.id,
        type: 'noul' as const,
        probability: question.id === 'candidate-a' ? 0.8 : 0.2,
        raw: { questionId: question.id },
      })),
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      raw: {},
      usage: null,
    }))
    const prepared = await prepareSingleCallClassifierDecision(makeSingleCallInput({ client }), {
      getActiveClassifierConfiguration: async () => configuration,
    })
    expect(client.requests).toHaveLength(1)
    expect(client.requests[0]?.questions.map(question => question.id)).toEqual([
      'candidate-a',
      'candidate-b',
    ])
    expect(prepared).toMatchObject({
      batchId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586ef9',
      classifierId: configuration.classifierId,
      promptVersionId: configuration.promptVersionId,
      subject: { postId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586e03', rssFeedItemId: null },
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            expect.objectContaining({
              topicId: topicAId,
              storedCandidateId: storedCandidateAId,
              probability: 0.8,
              rawResponse: { questionId: 'candidate-a' },
            }),
            expect.objectContaining({
              topicId: topicBId,
              storedCandidateId: null,
              probability: 0.2,
              rawResponse: { questionId: 'candidate-b' },
            }),
          ],
        },
      ],
    })
  })

  it.each<[string, (request: StructuredDecisionRequest) => StructuredDecisionResult, string]>([
    [
      'missing answer',
      request => ({ ...ok(request), answers: [] }),
      'Structured-decision shard did not cover every requested question',
    ],
    [
      'duplicate answer',
      (request: StructuredDecisionRequest) => ({
        ...ok(request),
        answers: [ok(request).answers[0]!, ok(request).answers[0]!],
      }),
      'Structured-decision shard returned duplicate answer IDs',
    ],
    [
      'wrong answer id',
      (request: StructuredDecisionRequest) => ({
        ...ok(request),
        answers: [{ ...ok(request).answers[0]!, id: 'unknown' }, ok(request).answers[1]!],
      }),
      'Structured-decision shard returned an unknown or missing answer',
    ],
    [
      'wrong primitive',
      (request: StructuredDecisionRequest) => ({
        ...ok(request),
        answers: [
          {
            id: request.questions[0]!.id,
            type: 'choice',
            choice: 'yes',
            confidence: 1,
            probabilities: { yes: 1 },
            raw: {},
          },
          ok(request).answers[1]!,
        ],
      }),
      'Structured-decision answer primitive does not match Noul binding',
    ],
    [
      'nonfinite probability',
      (request: StructuredDecisionRequest) => ({
        ...ok(request),
        answers: [
          { id: request.questions[0]!.id, type: 'noul', probability: Number.NaN, raw: {} },
          ok(request).answers[1]!,
        ],
      }),
      'Structured-decision answer produced an invalid probability',
    ],
  ])('rejects %s after exactly one provider call', async (_name, response, error) => {
    const client = makeClient(response)
    await expect(
      prepareSingleCallClassifierDecision(makeSingleCallInput({ client }), {
        getActiveClassifierConfiguration: async () => configuration,
      }),
    ).rejects.toThrow(error)
    expect(client.requests).toHaveLength(1)
  })

  it('rejects missing configuration and stale prompt before provider dispatch', async () => {
    const client = makeClient(() => {
      throw new Error('must not dispatch')
    })
    await expect(
      prepareSingleCallClassifierDecision(makeSingleCallInput({ client }), {
        getActiveClassifierConfiguration: async () => null,
      }),
    ).rejects.toThrow('active configuration')
    await expect(
      prepareSingleCallClassifierDecision(makeSingleCallInput({ client }), {
        getActiveClassifierConfiguration: async () => ({
          ...configuration,
          promptVersionId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586eff',
        }),
      }),
    ).rejects.toThrow('prompt version changed')
    expect(client.requests).toEqual([])
  })
})

function ok(request: StructuredDecisionRequest): StructuredDecisionResult {
  return {
    answers: request.questions.map(question => ({
      id: question.id,
      type: 'noul' as const,
      probability: 0.5,
      raw: {},
    })),
    model: 'typesafe/jev-1.13',
    provider: 'TypeSafe',
    raw: {},
    usage: null,
  }
}
