import { describe, it, expect } from 'vitest'
import { isHoneypotTriggered } from './validate.mts'

describe('isHoneypotTriggered', () => {
  it('returns false for empty body', () => {
    expect(isHoneypotTriggered({})).toBe(false)
  })

  it('returns false when hp_website is empty string', () => {
    expect(isHoneypotTriggered({ hp_website: '' })).toBe(false)
  })

  it('returns false when hp_phone is empty string', () => {
    expect(isHoneypotTriggered({ hp_phone: '' })).toBe(false)
  })

  it('returns false when both honeypot fields are empty strings', () => {
    expect(isHoneypotTriggered({ hp_website: '', hp_phone: '' })).toBe(false)
  })

  it('returns true when hp_website has a value', () => {
    expect(isHoneypotTriggered({ hp_website: 'http://spam.com' })).toBe(true)
  })

  it('returns true when hp_phone has a value', () => {
    expect(isHoneypotTriggered({ hp_phone: '555-1234' })).toBe(true)
  })

  it('returns false when hp_website is whitespace-only', () => {
    expect(isHoneypotTriggered({ hp_website: '   ' })).toBe(false)
  })

  it('returns false for null/undefined honeypot field values', () => {
    expect(isHoneypotTriggered({ hp_phone: null })).toBe(false)
    expect(isHoneypotTriggered({ hp_website: undefined })).toBe(false)
  })

  it('returns true for non-string non-empty honeypot field values', () => {
    expect(isHoneypotTriggered({ hp_website: 0 })).toBe(true)
    expect(isHoneypotTriggered({ hp_website: false })).toBe(true)
    expect(isHoneypotTriggered({ hp_phone: 1 })).toBe(true)
  })

  it('ignores unrelated fields', () => {
    expect(isHoneypotTriggered({ email: 'tests+user@voucha.ai', content: 'hello' })).toBe(false)
  })
})
