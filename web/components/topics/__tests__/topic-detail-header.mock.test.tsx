import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TopicDetailHeader } from '../topic-detail-header'
import type { Topic } from '@/types/topics'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

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

// Dynamically load the actual component so the FollowButton mock can intercept it
const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})
vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

// Capture props for assertions
let mockFollowButtonPropsList: Array<Record<string, unknown>> = []
vi.mock(
  import('@/components/shared/follow-button'),
  () =>
    ({
      FollowButton: (props: Record<string, unknown>) => {
        mockFollowButtonPropsList.push(props)
        return (
          <button
            type='button'
            data-testid='follow-button'
            data-entity-type={props.entityType as string}
            data-entity-id={props.entityId as string}
            data-pw={props['data-pw'] as string}
            aria-label='Follow topic'
          />
        )
      },
    }) as unknown as typeof import('@/components/shared/follow-button'),
)

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <span data-testid='entity-bookmark-button' />,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/rss-feed-link'), () => ({
  RssFeedLink: ({ href }: { href: string }) => (
    <a
      href={href}
      aria-label='RSS feed'
      data-testid='rss-feed-link'
    />
  ),
}))

vi.mock(
  import('@/components/topics/topic-vouch-disavow-vote'),
  () =>
    ({
      TopicVouchDisavowVote: () => null,
    }) as unknown as typeof import('@/components/topics/topic-vouch-disavow-vote'),
)

vi.mock(
  import('@/components/shared/topic-logo'),
  () =>
    ({
      TopicLogo: () => null,
    }) as unknown as typeof import('@/components/shared/topic-logo'),
)

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    __entity_type: 'topic',
    id: 'topic-1',
    name: 'Test Source',
    slug: 'test-source',
    markdown: '',
    aliases: [],
    topic_type: 'rss_feed',
    noindex: false,
    allow_reviews: true,
    created_at: '2024-01-01T00:00:00Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'u1', display_name: 'User', display_name_url_id: 'user' },
    updated_by: { id: 'u1', display_name: 'User', display_name_url_id: 'user' },
    ...overrides,
  }
}

describe('TopicDetailHeader', () => {
  it('renders the type badge AFTER the h1 in DOM order for a source topic', async () => {
    mockFollowButtonPropsList = []
    const { container } = render(
      <TopicDetailHeader topic={makeTopic({ topic_type: 'rss_feed' })} />,
    )

    const h1 = container.querySelector('h1')
    const badge = screen.getByText('Source')
    expect(h1).not.toBeNull()
    expect(badge).not.toBeNull()

    // Node.DOCUMENT_POSITION_FOLLOWING (4) means badge comes after h1
    const position = h1!.compareDocumentPosition(badge)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('[data-pw="topic-detail-header"]')).not.toBeNull()
    await screen.findByTestId('follow-button')
  })

  it('uses rss_feed entity for FollowButton when rssFeedId is provided on source topic', async () => {
    mockFollowButtonPropsList = []
    const { container } = render(
      <TopicDetailHeader
        topic={makeTopic({ topic_type: 'rss_feed' })}
        rssFeedId='feed-123'
        isFollowingRssFeed
      />,
    )

    // Wait for the mocked FollowButton (rss_feed entity) to appear
    await waitFor(() => {
      const sourceBtn = container.querySelector('[data-pw="follow-source-button"]')
      expect(sourceBtn).not.toBeNull()
    })

    // The mocked button for the rss_feed entity renders with data-pw='follow-source-button'
    const sourceBtn = container.querySelector('[data-pw="follow-source-button"]')
    expect(sourceBtn!.getAttribute('data-entity-type')).toBe('rss_feed')
    expect(sourceBtn!.getAttribute('data-entity-id')).toBe('feed-123')

    // The mocked props captured for the rss_feed button
    const rfProps = mockFollowButtonPropsList.find(p => p.entityType === 'rss_feed')
    expect(rfProps).toBeDefined()
    expect(rfProps!['data-pw']).toBe('follow-source-button')
    expect(rfProps!['inactiveLabel']).toBe('Follow Source')
    expect(rfProps!['activeLabel']).toBe('Following Source')

    // Wait for second follow element (topic entity) to appear
    // It may render as the mocked button (follow-topic-button) or the real signed-out link
    await waitFor(() => {
      const followEls = container.querySelectorAll(
        '[data-testid="follow-button"], [data-pw="signed-out-follow-link"], [data-pw="follow-topic-button"]',
      )
      expect(followEls.length).toBeGreaterThanOrEqual(2)
    })

    // The topic FollowButton may render as a mock stub or the real signed-out link depending
    // on nextDynamicMock timing. Either way 'Follow Topic' must appear as the inactive label.
    const topicMockProps = mockFollowButtonPropsList.find(p => p.entityType === 'topic')
    const topicSignedOutLink = container.querySelector('[data-pw="signed-out-follow-link"]')
    // At least one rendering path must be present
    expect(topicMockProps !== undefined || topicSignedOutLink !== null).toBe(true)
    // The inactiveLabel must be 'Follow Topic' — sourced from whichever path rendered
    const topicLabel = topicMockProps?.['inactiveLabel'] ?? topicSignedOutLink?.textContent
    expect(topicLabel).toBe('Follow Topic')
  })

  it('renders Follow Source before Follow Topic on source topics', async () => {
    mockFollowButtonPropsList = []
    const { container } = render(
      <TopicDetailHeader
        topic={makeTopic({ topic_type: 'rss_feed' })}
        rssFeedId='feed-123'
      />,
    )

    // Wait for both follow elements to appear in the DOM
    await waitFor(() => {
      const followEls = container.querySelectorAll(
        '[data-testid="follow-button"], [data-pw="signed-out-follow-link"], [data-pw="follow-topic-button"]',
      )
      expect(followEls.length).toBeGreaterThanOrEqual(2)
    })

    // Source button (rss_feed entity) renders via mock with data-pw='follow-source-button'
    const sourceBtn = container.querySelector('[data-pw="follow-source-button"]')
    expect(sourceBtn).not.toBeNull()

    // Source button must precede the second follow element in DOM
    const allFollowEls = container.querySelectorAll(
      '[data-testid="follow-button"], [data-pw="signed-out-follow-link"], [data-pw="follow-topic-button"]',
    )
    const secondFollowEl = allFollowEls[1]!
    const position = sourceBtn!.compareDocumentPosition(secondFollowEl)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('uses topic entity for FollowButton on non-source topic', async () => {
    mockFollowButtonPropsList = []
    const { findByTestId } = render(<TopicDetailHeader topic={makeTopic({ topic_type: 'card' })} />)

    // Wait for the dynamic FollowButton to load
    await findByTestId('follow-button')

    expect(mockFollowButtonPropsList).toHaveLength(1)
    expect(mockFollowButtonPropsList[0]!.entityType).toBe('topic')
    expect(mockFollowButtonPropsList[0]!.entityId).toBe('topic-1')
    // No explicit data-pw override — FollowButton uses its own default ('follow-button')
    expect(mockFollowButtonPropsList[0]!['data-pw']).toBeUndefined()
  })

  it('does not render RssFeedLink in the header (RSS link moved to actions aside)', async () => {
    mockCurrentUser = { id: 'user-1' } as User
    const { container } = render(
      <TopicDetailHeader
        topic={makeTopic({ topic_type: 'rss_feed' })}
        rssFeedId='feed-123'
      />,
    )

    // RSS feed link was relocated to TopicActionsAside; the header must not render it
    const rssFeedLink = container.querySelector('[data-testid="rss-feed-link"]')
    expect(rssFeedLink).toBeNull()
    await screen.findAllByTestId('follow-button')
  })
})
