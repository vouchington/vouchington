import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RssFeedLink } from '../rss-feed-link'

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Rss: () => <svg data-testid='rss-icon' />,
  }),
)

describe('RssFeedLink', () => {
  it('uses the canonical RSS icon', () => {
    render(
      <RssFeedLink
        href='/rss/posts'
        label='RSS Feed'
        withLabel
      />,
    )

    expect(screen.getByRole('link', { name: 'RSS Feed' })).toContainElement(
      screen.getByTestId('rss-icon'),
    )
  })
})
