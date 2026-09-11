import { describe, expect, it } from 'vitest'
import { isValidGTINCheckDigit, isValidGTINFormat } from './gtin.mts'

describe('isValidGTINFormat', () => {
  it('valid GTIN-8', () => expect(isValidGTINFormat('12345670')).toBe(true))
  it('valid GTIN-12', () => expect(isValidGTINFormat('012345678905')).toBe(true))
  it('valid GTIN-13', () => expect(isValidGTINFormat('4006381333931')).toBe(true))
  it('valid GTIN-14', () => expect(isValidGTINFormat('10012345678902')).toBe(true))
  it('rejects 7 digits', () => expect(isValidGTINFormat('1234567')).toBe(false))
  it('rejects 9 digits', () => expect(isValidGTINFormat('123456789')).toBe(false))
  it('rejects 11 digits', () => expect(isValidGTINFormat('12345678901')).toBe(false))
  it('rejects 15 digits', () => expect(isValidGTINFormat('123456789012345')).toBe(false))
  it('rejects non-numeric', () => expect(isValidGTINFormat('1234567a')).toBe(false))
  it('rejects empty string', () => expect(isValidGTINFormat('')).toBe(false))
})

describe('isValidGTINCheckDigit', () => {
  it('valid GTIN-8 check digit', () => expect(isValidGTINCheckDigit('12345670')).toBe(true))
  it('valid GTIN-12 check digit', () => expect(isValidGTINCheckDigit('012345678905')).toBe(true))
  it('valid GTIN-13 check digit', () => expect(isValidGTINCheckDigit('4006381333931')).toBe(true))
  it('valid GTIN-14 check digit', () => expect(isValidGTINCheckDigit('10012345678902')).toBe(true))
  it('invalid check digit GTIN-8', () => expect(isValidGTINCheckDigit('12345671')).toBe(false))
  it('invalid check digit GTIN-13', () =>
    expect(isValidGTINCheckDigit('4006381333932')).toBe(false))
  it('all zeros', () => expect(isValidGTINCheckDigit('00000000')).toBe(true))
  it('rejects invalid format', () => expect(isValidGTINCheckDigit('abc')).toBe(false))
})
