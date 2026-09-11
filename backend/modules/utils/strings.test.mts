import { it, expect, describe } from 'vitest'
import { stripControlCharacters } from './strings.mts'

describe('stripControlCharacters', () => {
  it('removes NUL bytes', () => {
    expect(stripControlCharacters('hello\x00world')).toBe('helloworld')
    expect(stripControlCharacters('\x00title\x00')).toBe('title')
  })

  it('removes C0 control chars (excluding \\t \\n \\r)', () => {
    expect(stripControlCharacters('a\x01b\x08c')).toBe('abc')
    expect(stripControlCharacters('a\x0Bb')).toBe('ab') // VT
    expect(stripControlCharacters('a\x0Cb')).toBe('ab') // FF
    expect(stripControlCharacters('a\x0Eb')).toBe('ab') // SO
    expect(stripControlCharacters('a\x1Fb')).toBe('ab') // unit separator
    expect(stripControlCharacters('a\x7Fb')).toBe('ab') // DEL
  })

  it('preserves \\t, \\n, \\r (valid in prose)', () => {
    expect(stripControlCharacters('line1\nline2')).toBe('line1\nline2')
    expect(stripControlCharacters('col1\tcol2')).toBe('col1\tcol2')
    expect(stripControlCharacters('a\r\nb')).toBe('a\r\nb')
  })

  it('leaves normal text unchanged', () => {
    expect(stripControlCharacters('Hello World')).toBe('Hello World')
    expect(stripControlCharacters('')).toBe('')
  })

  it('strips all controls from a control-only string', () => {
    expect(stripControlCharacters('\x00\x01\x7F')).toBe('')
  })
})
