import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { LandingPageAnalyticsCard } from '../landing-page-analytics-card'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

// LandingPageAnalyticsCard calls getTranslations(); mock the boundary with a real-catalog
// translator so the render stays synchronous in tests while still resolving keys against the
// real en catalog, so drift in ts-shared/ui-messages/messages/en.ts still breaks this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

describe('LandingPageAnalyticsCard', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  it('lists landing pages with analytics links', async () => {
    render(
      await LandingPageAnalyticsCard({
        landingPages: [
          {
            id: 'page-1',
            user_id: 'user-1',
            title: 'Primary',
            subtitle: null,
            slug: 'primary',
            is_default: true,
            created_at: '2026-06-10T00:00:00.000Z',
            updated_at: '2026-06-10T00:00:00.000Z',
          },
          {
            id: 'page-2',
            user_id: 'user-1',
            title: 'Secondary',
            subtitle: null,
            slug: 'secondary',
            is_default: false,
            created_at: '2026-06-10T00:00:00.000Z',
            updated_at: '2026-06-10T00:00:00.000Z',
          },
        ],
      }),
    )

    expect(screen.getByText('Landing Page Analytics')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('Secondary')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View analytics for Primary' })).toHaveAttribute(
      'href',
      '/admin/landing-pages/page-1/analytics',
    )
    expect(screen.getByRole('link', { name: 'View analytics for Secondary' })).toHaveAttribute(
      'href',
      '/admin/landing-pages/page-2/analytics',
    )
  })

  it('shows an empty state when the user has no landing pages', async () => {
    render(await LandingPageAnalyticsCard({ landingPages: [] }))

    expect(screen.getByText('No landing pages found for this user.')).toBeInTheDocument()
  })
})
