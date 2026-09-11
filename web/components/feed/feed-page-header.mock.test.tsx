import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'

// FeedPageHeader calls getTranslations(), which resolves the request's UI locale via
// getResolvedUiLocale() (headers()/getCurrentUser() — no request context in this test). Mocking
// the boundary with a real-catalog translator keeps the render synchronous while still resolving
// keys against the real en catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks
// this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/shared/title-route-dropdown'), () => ({
  TitleRouteDropdown: ({ label }: { label: string }) => <span>{label}</span>,
}))

import { FeedPageHeader } from './feed-page-header'

describe('FeedPageHeader', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  it('renders the feed title for posts category', async () => {
    render(
      await FeedPageHeader({
        category: 'posts',
        activeFilterPath: '/feed/posts',
      }),
    )
    expect(screen.getByText('My Posts Feed')).toBeDefined()
  })

  it('renders the feed title for news category', async () => {
    render(
      await FeedPageHeader({
        category: 'news',
        activeFilterPath: '/feed/news',
      }),
    )
    expect(screen.getByText('My News Feed')).toBeDefined()
  })

  it('renders the feed title for videos category', async () => {
    render(
      await FeedPageHeader({
        category: 'videos',
        activeFilterPath: '/feed/videos',
      }),
    )
    expect(screen.getByText('My Video Feed')).toBeDefined()
  })
})
