import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock(import('@/components/my/find-friends-tabs'), () => ({
  FindFriendsTabs: () => <nav />,
}))

// FindFriendsLayout calls getTranslations(), which resolves the request's UI locale via
// getResolvedUiLocale() (headers()/getCurrentUser() — no request context in this test). Mocking
// the boundary with a real-catalog translator keeps the render synchronous while still resolving
// keys against the real en catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks
// this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

import FindFriendsLayout from './layout'

describe('FindFriendsLayout', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  it('renders header, tabs, and children', async () => {
    const result = await FindFriendsLayout({ children: <main>content</main> })
    const { getByRole, getByText } = render(result)
    expect(getByRole('heading')).toHaveTextContent('Find Friends')
    expect(getByText('content')).toBeTruthy()
  })
})
