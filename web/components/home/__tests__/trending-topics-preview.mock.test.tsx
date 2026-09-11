import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendingTopicsPreview } from '../trending-topics-preview'
import type { TrendingTopicsViewModel } from '@/lib/view-models/homepage-view-models'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('TrendingTopicsPreview', () => {
  it('renders an empty state link when no topics are trending', () => {
    render(<TrendingTopicsPreview data={null} />)

    expect(screen.getByText('No trending topics yet.')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Browse all topics' }).getAttribute('href')).toBe(
      '/topics',
    )
  })

  it('renders trending topic links with hoverable card shell classes and metrics', () => {
    const data: TrendingTopicsViewModel = [
      {
        id: 'topic-1',
        name: 'Acme Rewards',
        href: '/card/acme-rewards',
        typeLabel: 'extracted.topicRecommendations.topicTypeSelectField.card_be3702e3',
        allowReviews: true,
        averageRating: 4.5,
        followerCount: 1250,
      },
    ]

    render(<TrendingTopicsPreview data={data} />)

    const topicLink = screen.getByRole('link', { name: /Acme Rewards/i })
    expect(topicLink.className).toContain('hover:shadow-md')
    expect(screen.getByText('4.5')).toBeDefined()
    expect(screen.getByText('1.3K')).toBeDefined()
    expect(screen.getByText('Card')).toBeDefined()
  })
})
