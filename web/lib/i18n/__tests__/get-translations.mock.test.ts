import { beforeEach, describe, expect, it, vi } from 'vitest'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { getTranslations } from '@/lib/i18n/get-translations'

let mockLocale = 'en'

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: vi.fn<VitestLooseMock>(() => Promise.resolve(mockLocale)),
}))

// `loadMessages` is the genuinely-async, code-split dynamic import (see use-translations.tsx's
// doc comment). This test always resolves 'en', so it's mocked to skip the real per-locale
// dynamic import while keeping `createTranslator` and every other export real.
vi.mock(import('@ts-shared/ui-messages'), async () => {
  const actual =
    await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
  return {
    ...actual,
    loadMessages: vi.fn<VitestLooseMock>(() => Promise.resolve(enMessages)),
  }
})

describe('getTranslations', () => {
  beforeEach(() => {
    mockLocale = 'en'
  })

  it('loads the resolved locale catalog and returns a bound translator', async () => {
    const t = await getTranslations()

    expect(t('settings.language.title')).toBe('Language')
  })

  it('interpolates params through the real ui-messages translator', async () => {
    const t = await getTranslations()

    expect(t('settings.language.currentLabel', { language: 'English' })).toBe(
      'Current language: English',
    )
  })
})
