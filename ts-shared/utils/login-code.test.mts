import { describe, expect, it } from 'vitest'
import {
  LOGIN_CODE_ALPHABET,
  LOGIN_CODE_INPUT_PATTERN,
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_PATTERN,
} from './login-code.mts'

describe('email code contract', () => {
  it.each(['ABCDEFG234', 'ZZZZZZZZZZ', '2222222222', '7777777777'])(
    'accepts a complete base32 code (%s)',
    code => {
      expect(LOGIN_CODE_PATTERN.test(code)).toBe(true)
      expect(LOGIN_CODE_INPUT_PATTERN.test(code)).toBe(true)
    },
  )

  it.each([
    '',
    'ABCDEFG23',
    'ABCDEFG2345',
    'ABCDEFG230',
    'ABCDEFG231',
    'ABCDEFG238',
    'ABCDEFG239',
    ' ABCDEFG234',
    'ABCDEFG234 ',
    'abcdefghij',
  ])('rejects an incomplete or noncanonical code (%s)', code => {
    expect(LOGIN_CODE_PATTERN.test(code)).toBe(false)
  })

  it.each(['', 'a', 'abc234', 'abcdefg234'])(
    'permits partial and lowercase input before completion (%s)',
    input => {
      expect(LOGIN_CODE_INPUT_PATTERN.test(input)).toBe(true)
    },
  )

  it.each(['0', '1', '8', '9', '+', ' ', '-'])(
    'rejects characters outside the base32 input alphabet (%s)',
    input => {
      expect(LOGIN_CODE_INPUT_PATTERN.test(input)).toBe(false)
    },
  )

  it('provides at least forty bits without duplicate alphabet entries', () => {
    expect(new Set(LOGIN_CODE_ALPHABET).size).toBe(LOGIN_CODE_ALPHABET.length)
    expect(Math.log2(LOGIN_CODE_ALPHABET.length) * LOGIN_CODE_LENGTH).toBeGreaterThanOrEqual(40)
    for (const character of LOGIN_CODE_ALPHABET) {
      expect(LOGIN_CODE_PATTERN.test(character.repeat(LOGIN_CODE_LENGTH))).toBe(true)
    }
  })
})
