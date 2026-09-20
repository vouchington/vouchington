import { describe, expect, it } from 'vitest'
import type { StructuredDecisionResult } from '@modules/structured-decisions'
import { assertCompleteCandidateCoverage, resultsForShard } from './results.mts'
import { classifierChoiceKey, classifierPrompt } from './safe-content.mts'
import { makeInput, storyAId, topicAId } from './test-helpers.mts'
import type { ClassifierQuestionBinding } from './types.mts'

const noulBindings = makeInput({}).bindings
const request = {
  state: 'state',
  questions: [
    { id: 'candidate-a', type: 'noul' as const, question: 'a' },
    { id: 'candidate-b', type: 'noul' as const, question: 'b' },
  ],
}

describe('classifier shard results', () => {
  it('rejects duplicate and unknown answer IDs', () => {
    expect(() =>
      resultsForShard(
        request,
        response([noulAnswer('candidate-a'), noulAnswer('candidate-a')]),
        noulBindings,
      ),
    ).toThrow('duplicate answer IDs')
    expect(() =>
      resultsForShard(
        request,
        response([noulAnswer('candidate-a'), noulAnswer('unknown')]),
        noulBindings,
      ),
    ).toThrow('unknown or missing answer')
  })

  it('rejects incomplete, duplicate, and unexpected candidate coverage', () => {
    expect(() => assertCompleteCandidateCoverage(noulBindings, [])).toThrow(
      'exact candidate coverage',
    )
    const topicResult = {
      candidateKind: 'topic' as const,
      topicId: topicAId,
      storedCandidateId: null,
      probability: 0.5,
      rawResponse: {},
    }
    expect(() =>
      assertCompleteCandidateCoverage(noulBindings, [
        { shardOrdinal: 0, results: [topicResult, topicResult] },
      ]),
    ).toThrow('exact candidate coverage')
    expect(() =>
      assertCompleteCandidateCoverage(noulBindings, [
        {
          shardOrdinal: 0,
          results: [{ ...topicResult, topicId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0d' }],
        },
      ]),
    ).toThrow('exact candidate coverage')
  })

  it('rejects primitive mismatches and invalid probabilities', () => {
    expect(() =>
      resultsForShard(
        { state: 'state', questions: [request.questions[0]!] },
        response([choiceAnswer('candidate-a', { yes: 1 })]),
        [noulBindings[0]!],
      ),
    ).toThrow('does not match Noul')
    expect(() =>
      resultsForShard(
        { state: 'state', questions: [request.questions[0]!] },
        response([noulAnswer('candidate-a', Number.NaN)]),
        [noulBindings[0]!],
      ),
    ).toThrow('invalid probability')
  })

  it('rejects a mismatched Choice answer and a missing bound criterion probability', () => {
    const binding = choiceBinding()
    const choiceRequest = {
      state: 'state',
      questions: [
        {
          id: binding.questionId,
          type: 'choice' as const,
          question: binding.question,
          criteria: binding.criteria.map(criterion => criterion.criterion),
        },
      ],
    }
    expect(() =>
      resultsForShard(choiceRequest, response([noulAnswer('stories')]), [binding]),
    ).toThrow('does not match Choice')
    expect(() =>
      resultsForShard(choiceRequest, response([choiceAnswer('stories', { none: 1 })]), [binding]),
    ).toThrow('omitted a bound criterion')
  })
})

function response(answers: StructuredDecisionResult['answers']): StructuredDecisionResult {
  return { answers, model: 'model', provider: 'provider', raw: {}, usage: null }
}

function noulAnswer(id: string, probability = 0.5) {
  return { id, type: 'noul' as const, probability, raw: { id, type: 'noul' } }
}

function choiceAnswer(id: string, probabilities: Record<string, number>) {
  return {
    id,
    type: 'choice' as const,
    choice: Object.keys(probabilities)[0] ?? 'none',
    confidence: 1,
    probabilities,
    raw: { id, type: 'choice' },
  }
}

function choiceBinding(): Extract<ClassifierQuestionBinding, { type: 'choice' }> {
  return {
    type: 'choice',
    questionId: 'stories',
    question: classifierPrompt`Which story applies?`,
    criteria: [
      {
        criterion: classifierChoiceKey('story-a'),
        candidate: { candidateKind: 'story', storyId: storyAId, storedCandidateId: null },
      },
      { criterion: classifierChoiceKey('none'), candidate: null },
    ],
  }
}
