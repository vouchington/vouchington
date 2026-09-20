import { describe, expect, it } from 'vitest'
import { packClassifierDecisionQuestions } from './pack.mts'
import type { ClassifierContextPolicy } from './types.mts'

describe('packClassifierDecisionQuestions', () => {
  it('keeps boundary-fit questions together and first-fits one-token-over questions deterministically', () => {
    const questions = [
      { id: 'a', type: 'noul' as const, question: 'a' },
      { id: 'b', type: 'noul' as const, question: 'b' },
      { id: 'c', type: 'noul' as const, question: 'c' },
    ]
    const policy: ClassifierContextPolicy = {
      transport: 'openrouter',
      model: 'typesafe/jev-1.13',
      measure: request => ({ totalTokens: request.questions.length * 16_000 }),
    }

    expect(packClassifierDecisionQuestions('state', questions, policy)).toEqual([
      { state: 'state', questions: [questions[0], questions[1]] },
      { state: 'state', questions: [questions[2]] },
    ])
  })

  it('fails closed when an indivisible question exceeds the active context limit', () => {
    const policy: ClassifierContextPolicy = {
      transport: 'openrouter',
      model: 'typesafe/jev-1.13',
      measure: () => ({ totalTokens: 32_001 }),
    }

    expect(() =>
      packClassifierDecisionQuestions('state', [{ id: 'a', type: 'noul', question: 'a' }], policy),
    ).toThrow('cannot fit')
  })

  it('enforces TypeSafe state-plus-longest-question budget independently', () => {
    const policy: ClassifierContextPolicy = {
      transport: 'typesafe',
      model: 'typesafe/jev-1.13',
      measure: () => ({ totalTokens: 1, stateAndLongestQuestionTokens: 32_001 }),
    }

    expect(() =>
      packClassifierDecisionQuestions('state', [{ id: 'a', type: 'noul', question: 'a' }], policy),
    ).toThrow('cannot fit')
  })
})
