import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types/user'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'

let mockUser: Pick<User, 'ui_locale'> | null = null
let mockAcceptLanguage: string | null = null

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>(() =>
    Promise.resolve({
      get: (name: string) => (name.toLowerCase() === 'accept-language' ? mockAcceptLanguage : null),
    }),
  ),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(() => Promise.resolve(mockUser)),
}))

describe('getResolvedUiLocale', () => {
  beforeEach(() => {
    mockUser = null
    mockAcceptLanguage = null
  })

  it('prefers the current user UI locale over request hints', async () => {
    mockUser = { ui_locale: 'en' }
    mockAcceptLanguage = 'fr'

    await expect(getResolvedUiLocale()).resolves.toBe('en')
  })

  it('resolves Accept-Language to a supported locale for an authenticated user with no saved locale', async () => {
    mockUser = { ui_locale: null }
    mockAcceptLanguage = 'fr, en-US;q=0.9'

    await expect(getResolvedUiLocale()).resolves.toBe('fr')
  })

  it('falls back to the default locale when Accept-Language has no supported match', async () => {
    mockUser = { ui_locale: null }
    mockAcceptLanguage = 'de, ja;q=0.9'

    await expect(getResolvedUiLocale()).resolves.toBe('en')
  })

  it('resolves an anonymous request Accept-Language to a supported locale (Worker anon cache is partitioned by locale, issue #6994)', async () => {
    mockUser = null
    mockAcceptLanguage = 'fr, en-US;q=0.9'

    await expect(getResolvedUiLocale()).resolves.toBe('fr')
  })

  it('falls back to the default locale for an anonymous request with no supported Accept-Language match', async () => {
    mockUser = null
    mockAcceptLanguage = 'de, ja;q=0.9'

    await expect(getResolvedUiLocale()).resolves.toBe('en')
  })
})
