import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import type { User } from '@/types/user'
import LanguagePage, { metadata } from './page'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

// LanguagePage calls getTranslations(), which resolves the request's UI locale via
// getResolvedUiLocale() (headers()/getCurrentUser() — no request context in this test). Mocking
// the boundary with a real-catalog translator keeps the render synchronous while still resolving
// keys against the real en catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks
// this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string
const requireCurrentUserMock = vi.hoisted(() => vi.fn<() => Promise<User>>())
const languageFormPropsMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

const serverUser: User = {
  id: 'user-1',
  roles: ['user'],
  username: 'private-username',
  email_address: 'tests+language-page-a91c@voucha.ai',
  country: 'US',
  ui_locale: 'es',
}

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))
vi.mock(import('@/components/my/language-form'), () => ({
  LanguageForm: (props: unknown) => {
    languageFormPropsMock(props)
    return <div data-testid='language-form' />
  },
}))
vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: requireCurrentUserMock,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(title => ({ title })),
}))

describe('LanguagePage', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
    requireCurrentUserMock.mockResolvedValue(serverUser)
  })

  it('renders language settings content', async () => {
    const { container } = render(await LanguagePage())

    expect(metadata).toEqual({ title: 'Language' })
    expect(container.querySelector('[data-pw="settings-page-header"]')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByText('Set your account country and interface language')).toBeInTheDocument()
    expect(screen.getByTestId('language-form')).toBeInTheDocument()
    expect(languageFormPropsMock).toHaveBeenCalledWith({
      initialUser: { id: 'user-1', country: 'US', uiLocale: 'es' },
    })
  })
})
