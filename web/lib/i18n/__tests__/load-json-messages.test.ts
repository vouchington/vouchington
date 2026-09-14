import { describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '../load-json-messages'

describe('loadJsonMessages', () => {
  it('loads the English web tree', async () => {
    const catalog = await loadJsonMessages('en')
    expect(createTranslator('en', catalog)('nav.home')).toBe('Home')
  })

  it('loads a supported non-English locale', async () => {
    const catalog = await loadJsonMessages('es')
    expect(createTranslator('es', catalog)('nav.home')).toBe('Inicio')
  })

  it('falls back to English for an unrecognized locale', async () => {
    const catalog = await loadJsonMessages('de')
    expect(createTranslator('en', catalog)('nav.home')).toBe('Home')
  })
})
