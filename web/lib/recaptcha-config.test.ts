import { describe, expect, it } from 'vitest'
import { getRecaptchaSiteKey, isRecaptchaConfigured } from './recaptcha-config'

describe('recaptcha-config', () => {
  it('getRecaptchaSiteKey returns the runtime public config value when set', () => {
    expect(getRecaptchaSiteKey({ recaptchaSiteKey: 'my-site-key' })).toBe('my-site-key')
  })

  it('getRecaptchaSiteKey trims whitespace', () => {
    expect(getRecaptchaSiteKey({ recaptchaSiteKey: '  my-site-key  ' })).toBe('my-site-key')
  })

  it('getRecaptchaSiteKey returns empty string when unset or whitespace-only', () => {
    expect(getRecaptchaSiteKey({ recaptchaSiteKey: '   ' })).toBe('')
  })

  it('isRecaptchaConfigured reflects whether the site key is non-empty', () => {
    expect(isRecaptchaConfigured({ recaptchaSiteKey: 'my-site-key' })).toBe(true)
    expect(isRecaptchaConfigured({ recaptchaSiteKey: '' })).toBe(false)
  })
})
