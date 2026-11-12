import { describe, expect, it } from 'vitest'
import { csvEscape } from './csv.mts'

describe('csvEscape', () => {
  it('leaves simple values unchanged', () => {
    expect(csvEscape('simple-value')).toBe('simple-value')
  })

  it('quotes values containing CSV delimiters', () => {
    expect(csvEscape('first,second')).toBe('"first,second"')
    expect(csvEscape('first\nsecond')).toBe('"first\nsecond"')
    expect(csvEscape('first\rsecond')).toBe('"first\rsecond"')
  })

  it('doubles embedded quotes inside quoted values', () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""')
  })
})
