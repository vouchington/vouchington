import { describe, expect, it } from 'vitest'
import { assertApplicationQuestionInputs } from './question-input.mts'

describe('application question input bounds', () => {
  it('rejects a select question with more than 32,768 options', () => {
    const options = Array.from({ length: 32_769 }, (_, i) => `o${i}`)

    expect(() =>
      assertApplicationQuestionInputs([{ question: 'Pick', field_type: 'multi_select', options }]),
    ).toThrow('Select questions must have no more than 32768 options')
  })

  it('accepts a select question with exactly 32,768 options', () => {
    const options = Array.from({ length: 32_768 }, (_, i) => `o${i}`)
    expect(() =>
      assertApplicationQuestionInputs([{ question: 'Pick', field_type: 'multi_select', options }]),
    ).not.toThrow()
  })
})
