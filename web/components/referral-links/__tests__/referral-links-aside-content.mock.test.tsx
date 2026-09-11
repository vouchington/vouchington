import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { ReferralLinksAsideContent } from '../referral-links-aside-content'
import type { PrioritizedReferralLinksResponse } from '@/types/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
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

function makeResponse(
  overrides?: Partial<PrioritizedReferralLinksResponse>,
): PrioritizedReferralLinksResponse {
  return {
    links: [
      {
        id: 'link-1',
        user_id: 'user-1',
        is_official: false,
        referral_program_id: 'rp-1',
        url: 'https://example.com/ref/abc',
        label: 'Chase Card Referral',
        priority_group: 5,
        contribution_rank: 1,
        tier_rank: 3,
        best_score: 10,
        review_post_id: null,
        review_post_slug: null,
        review_avg_rating: null,
      },
    ],
    users: {
      'user-1': { id: 'user-1', username: 'alice', display_name: 'Alice Smith' },
    },
    ...overrides,
  }
}

describe('ReferralLinksAsideContent', () => {
  it('renders nothing when there are no links', () => {
    const { container } = render(
      <ReferralLinksAsideContent
        topicId='topic-1'
        topicType='card'
        response={{ links: [], users: {} }}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders link and user name', () => {
    render(
      <ReferralLinksAsideContent
        topicId='topic-1'
        topicType='card'
        response={makeResponse()}
      />,
    )
    expect(screen.getByText('Chase Card Referral')).toBeInTheDocument()
    expect(screen.getByText('by Alice Smith')).toBeInTheDocument()
  })

  it('does not render review link when review_post_id is null', () => {
    render(
      <ReferralLinksAsideContent
        topicId='topic-1'
        topicType='card'
        response={makeResponse()}
      />,
    )
    // Links present: "View All" + the referral URL anchor — but no review link
    const reviewLink = screen.queryByRole('link', { name: /review/i })
    expect(reviewLink).toBeNull()
  })

  it('renders review link with rating when review_post_id is present', () => {
    const response = makeResponse({
      links: [
        {
          id: 'link-1',
          user_id: 'user-1',
          is_official: false,
          referral_program_id: 'rp-1',
          url: 'https://example.com/ref/abc',
          label: 'Chase Card Referral',
          priority_group: 5,
          contribution_rank: 1,
          tier_rank: 3,
          best_score: 10,
          review_post_id: 'post-abc',
          review_post_slug: 'my-chase-review',
          review_avg_rating: 4,
        },
      ],
    })
    render(
      <ReferralLinksAsideContent
        topicId='topic-1'
        topicType='card'
        response={response}
      />,
    )
    const reviewLink = screen.getByRole('link', { name: /4\.0\/5 review/i })
    expect(reviewLink).toHaveAttribute('href', '/review/my-chase-review')
  })

  it('renders "View All" link to the referral links tab', () => {
    render(
      <ReferralLinksAsideContent
        topicId='topic-abc'
        topicType='referral-program'
        response={makeResponse()}
      />,
    )
    const viewAllLink = screen.getByRole('link', { name: 'View All' })
    expect(viewAllLink).toHaveAttribute('href', '/referral-program/topic-abc/referral-links')
  })
})
