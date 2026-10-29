import { describe, expect, it } from 'vitest'
import { createTranslator, type MessageKey } from './index.mts'
import { catalogTreeForLocale } from './load-catalog-json.mts'
import { enMessages } from './locale-catalogs.mts'

describe('createTranslator', () => {
  const t = createTranslator('en', enMessages)

  it('retains Voucha number formatting for catalog number parameters', () => {
    expect(t('shared.countLabel.format', { count: 1_000, unit: 'member' })).toBe('1,000 members')
  })

  it('degrades missing and non-leaf keys when onUnresolved is set', () => {
    const unresolved: string[] = []
    const degrading = createTranslator('en', enMessages, {
      onUnresolved: key => {
        unresolved.push(key)
        return ''
      },
    })

    expect(degrading('nav.doesNotExist' as MessageKey)).toBe('')
    expect(degrading('settings.language' as MessageKey)).toBe('')
    expect(unresolved).toEqual(['nav.doesNotExist', 'settings.language'])
    expect(degrading('settings.language.title')).toBe('Language')
  })

  it('preserves message descriptors after assembling the public catalog', () => {
    const catalog = catalogTreeForLocale('en')
    const translate = createTranslator('en', catalog)

    expect(translate('settings.language.supportedCount', { count: 2 })).toBe('2 languages')
  })

  it('still throws unknown select-plural cases when onUnresolved is set', () => {
    const degrading = createTranslator('en', enMessages, { onUnresolved: () => '' })
    expect(() =>
      degrading('shared.timeAgo.relativeDuration', { unit: 'fortnight', value: 2 }),
    ).toThrow('Unknown select-plural case "fortnight" for "unit"')
  })
})
