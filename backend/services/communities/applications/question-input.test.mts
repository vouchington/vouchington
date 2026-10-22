import { describe, expect, it } from 'vitest'
import { assertApplicationQuestionInputs } from './question-input.mts'

describe('application question input bounds', () => {
  it('rejects a select question with more than 32,768 options', () => {
    const options = new Proxy(['Choice'], {
      get(target, property, receiver) {
        return property === 'length' ? 32_769 : Reflect.get(target, property, receiver)
      },
    })

    expect(() =>
      assertApplicationQuestionInputs([{ question: 'Pick', field_type: 'multi_select', options }]),
    ).toThrow('Select questions must have no more than 32768 options')
  })
})
