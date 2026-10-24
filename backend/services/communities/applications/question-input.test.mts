import { describe, expect, it } from 'vitest'
import {
  assertApplicationQuestionInputs,
  MAX_APPLICATION_QUESTION_OPTIONS,
} from './question-input.mts'

describe('application question input bounds', () => {
  it('rejects a select question with more than 32,768 options', () => {
    const options = Array.from({ length: MAX_APPLICATION_QUESTION_OPTIONS + 1 }, (_, i) => `o${i}`)

    expect(() =>
      assertApplicationQuestionInputs([{ question: 'Pick', field_type: 'multi_select', options }]),
    ).toThrow('Select questions must have no more than 32768 options')
  })

  it('accepts a select question with exactly 32,768 options', () => {
    expect(MAX_APPLICATION_QUESTION_OPTIONS).toBe(32_768)
    const options = Array.from({ length: MAX_APPLICATION_QUESTION_OPTIONS }, (_, i) => `o${i}`)
    expect(() =>
      assertApplicationQuestionInputs([{ question: 'Pick', field_type: 'multi_select', options }]),
    ).not.toThrow()
  })
})
