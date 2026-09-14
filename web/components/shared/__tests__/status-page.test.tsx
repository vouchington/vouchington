import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { StatusPage } from '../status-page'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('StatusPage', () => {
  let t: ReturnType<typeof useTranslations>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders the status, title, and description', () => {
    render(
      StatusPage({
        status: 503,
        title: 'Offline',
        description: "You're offline right now. Reconnect and we'll pick up where you left off.",
        t,
      }),
    )

    expect(screen.getByText('503')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Offline' })).toHaveAttribute(
      'data-pw',
      'status-page-title',
    )
    expect(
      screen.getByText("You're offline right now. Reconnect and we'll pick up where you left off."),
    ).toHaveAttribute('data-pw', 'status-page-description')
  })

  it('renders the recovery navigation links with Playwright hooks', () => {
    render(
      StatusPage({
        status: 404,
        title: 'Page not found',
        description: "We couldn't find that page — it may have moved or never existed.",
        t,
      }),
    )

    const homeLink = screen.getByRole('link', { name: /home/i })
    const topicsLink = screen.getByRole('link', { name: /topics/i })
    const discussionsLink = screen.getByRole('link', { name: /discussions/i })
    const reviewsLink = screen.getByRole('link', { name: /reviews/i })

    expect(homeLink).toHaveAttribute('href', '/')
    expect(homeLink).toHaveAttribute('data-pw', 'status-page-home-link')

    expect(topicsLink).toHaveAttribute('href', '/topics')
    expect(topicsLink).toHaveAttribute('data-pw', 'status-page-topics-link')

    expect(discussionsLink).toHaveAttribute('href', '/discussions')
    expect(discussionsLink).toHaveAttribute('data-pw', 'status-page-discussions-link')

    expect(reviewsLink).toHaveAttribute('href', '/reviews')
    expect(reviewsLink).toHaveAttribute('data-pw', 'status-page-reviews-link')
  })
})
