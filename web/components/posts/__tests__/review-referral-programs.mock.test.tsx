import { beforeAll, describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { ReviewReferralPrograms } from '../review-referral-programs'
import type { Post } from '@/types/posts'

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

function makeReviewPost(overrides?: Partial<Post>): Post {
  return {
    id: 'post-1',
    post_type: 'review',
    title: 'My Review',
    markdown: '',
    root_id: null,
    created_by_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    broadcast: 'everyone',
    privacy: 'public',
    is_anonymous: false,

    community_id: null,

    clearance_status: 'approved',
    ...overrides,
  }
}

describe('ReviewReferralPrograms', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(() => {
    t = createTranslator('en', enMessages)
  })

  it('renders nothing for non-review posts', () => {
    const post = makeReviewPost({ post_type: 'discussion' })
    const { container } = render(
      <ReviewReferralPrograms
        t={t}
        post={post}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when no review topics have referral programs', async () => {
    const post = makeReviewPost({
      review_topic_ratings: [
        {
          topic_id: 'topic-1',
          rating: 4,
          order_index: 0,
          updated_at: new Date().toISOString(),
          topic: {
            __entity_type: 'topic',
            id: 'topic-1',
            name: 'Chase Sapphire',
            slug: 'chase-sapphire',
            markdown: '',
            topic_type: 'card',
            created_at: new Date().toISOString(),
            referral_program_id: null,
          },
        },
      ],
    })
    const { container } = render(
      <ReviewReferralPrograms
        t={t}
        post={post}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders referral program links for topics with referral_program_id', async () => {
    const post = makeReviewPost({
      review_topic_ratings: [
        {
          topic_id: 'topic-1',
          rating: 4,
          order_index: 0,
          updated_at: new Date().toISOString(),
          topic: {
            __entity_type: 'topic',
            id: 'topic-1',
            name: 'Chase Sapphire',
            slug: 'chase-sapphire',
            markdown: '',
            topic_type: 'card',
            created_at: new Date().toISOString(),
            referral_program_id: 'rp-1',
          },
        },
      ],
    })
    render(
      <ReviewReferralPrograms
        t={t}
        post={post}
      />,
    )
    expect(screen.getByText('Referral Links')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Chase Sapphire referral links/i })
    expect(link).toHaveAttribute('href', '/referral-program/rp-1/referral-links')
  })

  it('renders links for topics that are referral programs themselves', async () => {
    const post = makeReviewPost({
      review_topic_ratings: [
        {
          topic_id: 'rp-1',
          rating: 5,
          order_index: 0,
          updated_at: new Date().toISOString(),
          topic: {
            __entity_type: 'topic',
            id: 'rp-1',
            name: 'Chase Referral',
            slug: 'chase-referral',
            markdown: '',
            topic_type: 'referral_program',
            created_at: new Date().toISOString(),
            referral_program_id: null,
          },
        },
      ],
    })
    render(
      <ReviewReferralPrograms
        t={t}
        post={post}
      />,
    )
    const link = screen.getByRole('link', { name: /Chase Referral referral links/i })
    expect(link).toHaveAttribute('href', '/referral-program/chase-referral/referral-links')
  })

  it('deduplicates referral programs across multiple rated topics', async () => {
    const post = makeReviewPost({
      review_topic_ratings: [
        {
          topic_id: 'topic-1',
          rating: 4,
          order_index: 0,
          updated_at: new Date().toISOString(),
          topic: {
            __entity_type: 'topic',
            id: 'topic-1',
            name: 'Card A',
            slug: 'card-a',
            markdown: '',
            topic_type: 'card',
            created_at: new Date().toISOString(),
            referral_program_id: 'rp-shared',
          },
        },
        {
          topic_id: 'topic-2',
          rating: 3,
          order_index: 1,
          updated_at: new Date().toISOString(),
          topic: {
            __entity_type: 'topic',
            id: 'topic-2',
            name: 'Card B',
            slug: 'card-b',
            markdown: '',
            topic_type: 'card',
            created_at: new Date().toISOString(),
            referral_program_id: 'rp-shared',
          },
        },
      ],
    })
    render(
      <ReviewReferralPrograms
        t={t}
        post={post}
      />,
    )
    // Only one link should be rendered despite two topics sharing the same referral program
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
  })

  it('renders nothing when review has no topic_ratings', async () => {
    const post = makeReviewPost({ review_topic_ratings: [] })
    const { container } = render(
      <ReviewReferralPrograms
        t={t}
        post={post}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
