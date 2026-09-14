import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { EnCatalog } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

let mockLocale = 'en'

const { mockLoadJsonMessages } = vi.hoisted(() => ({
  mockLoadJsonMessages: vi.fn<(locale: string) => Promise<EnCatalog>>(),
}))

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

vi.mock(import('@/lib/i18n/load-json-messages'), () => ({
  loadJsonMessages: mockLoadJsonMessages,
}))

vi.mock(import('@/lib/i18n/load-server-messages'), () => ({
  loadServerMessages: vi.fn<VitestLooseMock>(() => Promise.resolve(enMessages)),
}))

describe('getTranslations', () => {
  beforeEach(() => {
    mockLocale = 'en'
    mockLoadJsonMessages.mockReset()
    mockLoadJsonMessages.mockResolvedValue(enMessages)
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

  it('degrades a selected-catalog miss instead of throwing', async () => {
    mockLoadJsonMessages.mockResolvedValue({ nav: { home: 'Home' } })
    const t = await getTranslations()

    expect(t('extracted.login.page.signInOrCreateAccount_c29dcc85')).toBe('')
    expect(t('nav.home')).toBe('Home')
  })
})
