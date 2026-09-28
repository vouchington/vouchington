import { describe, expect, it } from 'vitest'
import { assertApplicationQuestionInputs } from './question-input.mts'

const MAX_APPLICATION_QUESTION_OPTIONS = 32768

function selectQuestion(optionCount: number) {
  return {
    question: 'Pick one',
    field_type: 'single_select' as const,
    options: Array.from({ length: optionCount }, (_, index) => String(index)),
  }
}

describe('assertApplicationQuestionInputs option order', () => {
  it('accepts 32768 options', () => {
    expect(() =>
      assertApplicationQuestionInputs([selectQuestion(MAX_APPLICATION_QUESTION_OPTIONS)]),
    ).not.toThrow()
  })

  it('rejects 32769 options', () => {
    expect(() =>
      assertApplicationQuestionInputs([selectQuestion(MAX_APPLICATION_QUESTION_OPTIONS + 1)]),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        message: 'A question cannot have more than 32768 options',
      }),
    )
  })
})
