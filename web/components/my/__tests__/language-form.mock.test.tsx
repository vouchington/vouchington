import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types/user'
import { updateMyUser } from '@/lib/api/client/users'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { LanguageForm } from '../language-form'

const defaultUser = { id: 'user-1', country: 'US', ui_locale: 'en' } as User

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

// LanguageForm calls useTranslations(), which suspends via `use()` on the real dynamic
// import. Mocking the hook (rather than wrapping every render in <Suspense>) keeps this file's
// existing synchronous render()/fireEvent flow intact while still resolving keys against the
// real `en` catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

vi.mock(import('@/lib/api/client/users'), () => ({
  updateMyUser: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))
vi.mock(
  import('@/components/ui/label'),
  () =>
    ({
      Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
      ),
    }) as unknown as typeof import('@/components/ui/label'),
)
vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        disabled,
        onValueChange,
        value,
      }: {
        children: React.ReactNode
        disabled?: boolean
        onValueChange: (value: string) => void
        value: string
      }) => (
        <select
          aria-label={
            value === 'US' || value === 'CA' || value === 'no-country'
              ? 'Country'
              : 'Interface language'
          }
          disabled={disabled}
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: React.ReactNode }) => children,
      SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('LanguageForm', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateMyUser).mockResolvedValue({ user: { id: 'user-1', roles: [] } })
  })

  it('saves a selected country for the current user', async () => {
    render(
      <LanguageForm
        initialUser={{
          id: defaultUser.id,
          country: defaultUser.country ?? null,
          uiLocale: defaultUser.ui_locale ?? null,
        }}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Country' }), {
      target: { value: 'CA' },
    })

    await waitFor(() => expect(updateMyUser).toHaveBeenCalledWith('user-1', { country: 'CA' }))
    expect(mockOnSuccess).toHaveBeenCalledWith('Country preference saved.')
  })

  it('saves a selected UI locale for the current user', async () => {
    render(
      <LanguageForm
        initialUser={{
          id: defaultUser.id,
          country: defaultUser.country ?? null,
          uiLocale: defaultUser.ui_locale ?? null,
        }}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Interface language' }), {
      target: { value: 'en' },
    })

    await waitFor(() => expect(updateMyUser).toHaveBeenCalledWith('user-1', { ui_locale: 'en' }))
    expect(mockOnSuccess).toHaveBeenCalledWith(
      'Interface language saved. Reload the page to apply the new language.',
    )
  })

  it('saves site default as a null UI locale', async () => {
    render(
      <LanguageForm
        initialUser={{
          id: defaultUser.id,
          country: defaultUser.country ?? null,
          uiLocale: defaultUser.ui_locale ?? null,
        }}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Interface language' }), {
      target: { value: 'site-default' },
    })

    await waitFor(() => expect(updateMyUser).toHaveBeenCalledWith('user-1', { ui_locale: null }))
  })

  it('reports failed UI locale updates and restores the previous selection', async () => {
    vi.mocked(updateMyUser).mockRejectedValueOnce(new Error('network'))
    render(
      <LanguageForm
        initialUser={{
          id: defaultUser.id,
          country: defaultUser.country ?? null,
          uiLocale: defaultUser.ui_locale ?? null,
        }}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Interface language' })
    fireEvent.change(select, { target: { value: 'site-default' } })

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to save interface language',
      }),
    )
    expect(select).toHaveValue('en')
  })

  it('uses site default when the user has no preferred UI locale', () => {
    const user = { id: 'user-1', country: null, ui_locale: null } as User

    render(
      <LanguageForm
        initialUser={{
          id: user.id,
          country: user.country ?? null,
          uiLocale: user.ui_locale ?? null,
        }}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('no-country')
    expect(screen.getByRole('combobox', { name: 'Interface language' })).toHaveValue('site-default')
  })
})
