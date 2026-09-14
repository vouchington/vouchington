import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))

vi.mock(import('./data-request-section'), () => ({
  DataRequestSection: ({ userId }: { userId: string }) => (
    <div data-pw='data-request-section'>{userId}</div>
  ),
}))

vi.mock(import('./delete-account-dialog'), () => ({
  DeleteAccountDialog: ({ userId }: { userId: string }) => (
    <button
      type='button'
      data-pw='delete-account-dialog'
    >
      {userId}
    </button>
  ),
}))

// DataPage calls getTranslations(), which resolves the request's UI locale via
// getResolvedUiLocale() (headers()/getCurrentUser() — no request context in this test). Mocking
// the boundary with a real-catalog translator keeps the render synchronous while still resolving
// keys against the real en catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks
// this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

import DataPage from './page'

describe('DataPage', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  it('renders user-scoped data controls', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce({ id: 'user-1', username: 'alice' })

    const { container } = render(await DataPage())

    expect(mockRequireCurrentUser).toHaveBeenCalled()
    expect(container.querySelector('[data-pw="data-request-section"]')).toHaveTextContent('user-1')
    expect(container.querySelector('[data-pw="delete-account-dialog"]')).toHaveTextContent('user-1')
    expect(screen.getByText('Delete Account')).toBeVisible()
  })
})
