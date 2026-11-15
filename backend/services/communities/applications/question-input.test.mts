import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { assertApplicationQuestionInputs } from './question-input.mts'
import {
  communityApplicationLimitsConfig,
  getCommunityApplicationLimits,
} from './question-limits.mts'

const OPTION_CAP = 3
const QUESTION_CAP = 2

function selectQuestion(optionCount: number) {
  const options = Array.from({ length: optionCount }, (_, i) => `o${i}`)
  return { question: 'Pick', field_type: 'multi_select' as const, options }
}

describe('application question input caps', () => {
  it('defaults to 50 questions and 100 options', () => {
    expect(getCommunityApplicationLimits()).toEqual({
      questionsPerCommunity: 50,
      optionsPerQuestion: 100,
    })
  })

  it('rejects one option past the configured cap with a stable code', () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityApplicationLimitsConfig, {
        options_per_question: OPTION_CAP,
      }),
    )
    expect(() => assertApplicationQuestionInputs([selectQuestion(OPTION_CAP)])).not.toThrow()
    expect(() => assertApplicationQuestionInputs([selectQuestion(OPTION_CAP + 1)])).toThrow(
      expect.objectContaining({
        status: 409,
        code: 'COMMUNITY_APPLICATION_QUESTION_OPTION_LIMIT_REACHED',
      }),
    )
  })

  it('rejects one question past the configured cap with a stable code', () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityApplicationLimitsConfig, {
        questions_per_community: QUESTION_CAP,
      }),
    )
    const question = { question: 'Why?', field_type: 'short_text' as const }
    expect(() =>
      assertApplicationQuestionInputs(Array.from({ length: QUESTION_CAP }, () => question)),
    ).not.toThrow()
    expect(() =>
      assertApplicationQuestionInputs(Array.from({ length: QUESTION_CAP + 1 }, () => question)),
    ).toThrow(
      expect.objectContaining({
        status: 409,
        code: 'COMMUNITY_APPLICATION_QUESTION_LIMIT_REACHED',
      }),
    )
  })
})
