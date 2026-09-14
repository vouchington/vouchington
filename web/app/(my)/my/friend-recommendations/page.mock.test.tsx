import { render } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

const { mockRequireCurrentUser, mockGetMyFriendRecommendations } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyFriendRecommendations: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/lib/api/server'), () => ({
  getMyFriendRecommendations: mockGetMyFriendRecommendations,
}))
vi.mock(import('@/components/my/friend-recommendations-list'), () => ({
  FriendRecommendationsList: () => <div />,
}))

// FriendRecommendationsPage calls getTranslations(), which resolves the request's UI locale via
// getResolvedUiLocale() (headers()/getCurrentUser() — no request context in this test). Mocking
// the boundary with a real-catalog translator keeps the render synchronous while still resolving
// keys against the real en catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks
// this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

import FriendRecommendationsPage from './page'

const emptyData = { results: [], page_info: { has_next_page: false, end_cursor: null } }

describe('FriendRecommendationsPage', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockGetMyFriendRecommendations.mockReset()
  })

  it('redirects to /login before loading recommendations when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))

    await expect(FriendRecommendationsPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
    expect(mockGetMyFriendRecommendations).not.toHaveBeenCalled()
  })

  it('renders description and identity link', async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1', username: 'alice' })
    mockGetMyFriendRecommendations.mockResolvedValue(emptyData)
    const { container } = render(await FriendRecommendationsPage())
    expect(mockRequireCurrentUser).toHaveBeenCalled()
    expect(container.querySelector('[data-pw="friend-recommendations-description"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="friend-recommendations-identity-link"]')).toBeTruthy()
  })
})
