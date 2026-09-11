import { describe, expect, it } from 'vitest'
import { defaultTranslator } from './default-translator.mts'

describe('defaultTranslator', () => {
  it('resolves English messages for non-request-scoped callers', () => {
    expect(defaultTranslator('settings.language.title')).toBe('Language')
  })
})
