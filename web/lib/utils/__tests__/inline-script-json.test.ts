import { describe, expect, it } from 'vitest'
import { escapeInlineScriptJson } from '../inline-script-json'

describe('escapeInlineScriptJson', () => {
  it('leaves safe JSON unchanged', () => {
    expect(escapeInlineScriptJson('{"key":"value"}')).toBe('{"key":"value"}')
  })

  it('handles empty strings', () => {
    expect(escapeInlineScriptJson('')).toBe('')
  })

  it('escapes script-close and line separator characters', () => {
    const lineSeparator = String.fromCodePoint(0x20_28)
    const paragraphSeparator = String.fromCodePoint(0x20_29)

    expect(escapeInlineScriptJson(`{"test":"<${lineSeparator}${paragraphSeparator}"}`)).toBe(
      String.raw`{"test":"\u003c\u2028\u2029"}`,
    )
  })

  it('escapes multiple occurrences', () => {
    expect(escapeInlineScriptJson('<<<')).toBe(String.raw`\u003c\u003c\u003c`)
  })
})
