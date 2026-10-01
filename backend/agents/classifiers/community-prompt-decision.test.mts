import { describe, expect, it } from 'vitest'
import type {
  ActiveClassifierConfiguration,
  PersistClassifierDecisionInput,
} from '@services/classifiers'
import { executeSingleCallClassifierDecision } from './execute-single-call.mts'
import { assertCompleteCandidateCoverage } from './results.mts'
import { classifierPrompt } from './safe-content.mts'
import type {
  CommunityPromptClassifierCandidate,
  ExecuteClassifierDecisionInput,
  NoulClassifierBinding,
} from './types.mts'
import {
  assertBindingsMatchConfiguration,
  assertClassifierDecisionIds,
} from './validate-bindings.mts'
import {
  configuration as topicConfiguration,
  makeClient,
  makeInput,
  makeSingleCallInput,
  rssFeedItemId,
  topicAId,
} from '@voucha/test-helpers/agents/classifiers/fixtures'

const communityId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0c'
const configuration: ActiveClassifierConfiguration = {
  ...topicConfiguration,
  candidateKind: 'community_prompt',
}
const communityScope = { scopeCategory: 'community_ai', scopeCommunityId: communityId } as const

const promptId = (index: number) =>
  `018f9f8e-7c49-7b88-8c4a-${(0xa00000000000 + index).toString(16)}`

const promptBinding = (
  index: number,
  communityPromptId = promptId(index),
): NoulClassifierBinding => ({
  type: 'noul',
  questionId: `prompt-${index}`,
  question: classifierPrompt`Does the content break this community rule?`,
  candidate: { candidateKind: 'community_prompt', communityPromptId, storedCandidateId: null },
})

const promptBindings = (count: number) =>
  Array.from({ length: count }, (_value, index) => promptBinding(index))

const promptInput = (overrides: Partial<ExecuteClassifierDecisionInput> = {}) =>
  makeInput({ scope: communityScope, bindings: promptBindings(2), ...overrides })

describe('community prompt classifier decisions', () => {
  it('asks every community prompt in one request and keys each result by its prompt', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    const client = makeClient(request => ({
      answers: request.questions.map((question, index) => ({
        id: question.id,
        type: 'noul' as const,
        probability: index / 10,
        raw: { id: question.id, type: 'noul' },
      })),
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      raw: {},
      usage: null,
    }))

    await executeSingleCallClassifierDecision(
      makeSingleCallInput({ client, scope: communityScope, bindings: promptBindings(10) }),
      {
        getActiveClassifierConfiguration: async () => configuration,
        persistClassifierDecision: async input => {
          persisted.push(input)
          return { decision: input as never, replayed: false }
        },
      },
    )

    expect(client.requests).toHaveLength(1)
    expect(client.requests[0]?.questions).toHaveLength(10)
    expect(persisted).toHaveLength(1)
    const results = persisted[0]!.calls.flatMap(call => call.results)
    expect(results).toHaveLength(10)
    expect(results[3]).toEqual({
      candidateKind: 'community_prompt',
      communityPromptId: promptId(3),
      storedCandidateId: null,
      probability: 0.3,
      rawResponse: { id: 'prompt-3', type: 'noul' },
    })
  })

  it('requires a post subject, a community scope and matching candidates', () => {
    expect(() => assertBindingsMatchConfiguration(promptInput(), configuration)).not.toThrow()
    expect(() =>
      assertBindingsMatchConfiguration(
        promptInput({ subject: { postId: null, rssFeedItemId } }),
        configuration,
      ),
    ).toThrow('post subject and a community scope')
    expect(() =>
      assertBindingsMatchConfiguration(
        promptInput({ scope: { scopeCategory: 'global', scopeCommunityId: null } }),
        configuration,
      ),
    ).toThrow('post subject and a community scope')
    expect(() =>
      assertBindingsMatchConfiguration(
        promptInput({ bindings: makeInput({}).bindings }),
        configuration,
      ),
    ).toThrow(/./)
    expect(() =>
      assertBindingsMatchConfiguration(
        promptInput({ bindings: [promptBinding(0, ' ')] }),
        configuration,
      ),
    ).toThrow('concrete entity ID')
  })

  it('validates community prompt ids as durable ids and rejects duplicate prompts', () => {
    expect(() => assertClassifierDecisionIds(promptInput())).not.toThrow()
    expect(() =>
      assertClassifierDecisionIds(promptInput({ bindings: [promptBinding(0, 'not-a-uuid')] })),
    ).toThrow(/./)
    expect(() =>
      assertBindingsMatchConfiguration(
        promptInput({
          bindings: [
            promptBinding(0),
            { ...promptBinding(1), candidate: promptBinding(0).candidate },
          ],
        }),
        configuration,
      ),
    ).toThrow('duplicate')
  })

  it('requires exact coverage of the bound community prompts', () => {
    const bindings = promptBindings(2)
    const result = (candidate: CommunityPromptClassifierCandidate) => ({
      ...candidate,
      probability: 0.5,
      rawResponse: {},
    })
    const [first, second] = bindings.map(
      binding => binding.candidate as CommunityPromptClassifierCandidate,
    )

    expect(() =>
      assertCompleteCandidateCoverage(bindings, [
        { shardOrdinal: 0, results: [result(first!), result(second!)] },
      ]),
    ).not.toThrow()
    expect(() =>
      assertCompleteCandidateCoverage(bindings, [{ shardOrdinal: 0, results: [result(first!)] }]),
    ).toThrow('exact candidate coverage')
    expect(() =>
      assertCompleteCandidateCoverage(bindings, [
        {
          shardOrdinal: 0,
          results: [
            result(first!),
            {
              candidateKind: 'topic',
              topicId: topicAId,
              storedCandidateId: null,
              probability: 0.5,
              rawResponse: {},
            },
          ],
        },
      ]),
    ).toThrow('exact candidate coverage')
  })
})
