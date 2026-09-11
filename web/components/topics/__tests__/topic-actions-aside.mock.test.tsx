import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicActionsAside } from '@/components/topics/topic-actions-aside'
import type { TopicTypes } from '@/types/topics'
import type { User } from '@/types/user'

const mockUseAuth = vi.fn<() => { currentUser: User | null }>()
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => mockUseAuth(),
    }) as unknown as typeof import('@/lib/auth/context'),
)

const MOCK_MUTE_LOGIN_HREF = `/login?next=${encodeURIComponent('/card/topic-1/posts')}&intent=mute`

vi.mock(import('@/hooks/use-login-href'), () => ({
  useLoginHref: () => MOCK_MUTE_LOGIN_HREF,
}))

interface EntityBookmarkButtonProps {
  entityType: string
  entityId: string
  preset: string
  predicate?: string
  initialActive?: boolean
  inactiveLabel?: string
  activeLabel?: string
  tooltip?: string
  'data-pw'?: string
}

const mockEntityBookmarkButtonPropsList: EntityBookmarkButtonProps[] = []

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: (props: EntityBookmarkButtonProps) => {
        mockEntityBookmarkButtonPropsList.push(props)
        return (
          <button
            type='button'
            data-pw={props['data-pw']}
          >
            {props.inactiveLabel ?? props.preset}
          </button>
        )
      },
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...rest
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...rest}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const mockUser = { id: 'user-1', username: 'jong' } as User

const baseProps = {
  topicId: 'topic-1',
  topicType: 'card' as TopicTypes,
  topicSlug: 'trade-platform',
}

describe('TopicActionsAside', () => {
  beforeEach(() => {
    mockEntityBookmarkButtonPropsList.length = 0
    mockUseAuth.mockReturnValue({ currentUser: mockUser })
  })

  describe('authenticated', () => {
    it('renders the RSS feed link with a slug-based href', () => {
      render(<TopicActionsAside {...baseProps} />)

      const rssLink = screen.getByRole('link', { name: 'RSS Feed' })
      expect(rssLink).toHaveAttribute(
        'href',
        `/rss/posts?topics=${encodeURIComponent('trade-platform')}`,
      )
      expect(rssLink).toHaveAttribute('target', '_blank')
    })

    it('url-encodes the topic slug in the RSS feed href', () => {
      render(
        <TopicActionsAside
          {...baseProps}
          topicSlug='a b&c'
        />,
      )

      expect(screen.getByRole('link', { name: 'RSS Feed' })).toHaveAttribute(
        'href',
        '/rss/posts?topics=a%20b%26c',
      )
    })

    it('shows all three contribute links for card topic with topic_id param', () => {
      render(<TopicActionsAside {...baseProps} />)

      const reviewLink = screen.getByRole('link', { name: 'Write a Review' })
      expect(reviewLink).toHaveAttribute('href', '/reviews/create?topic_id=topic-1')
      expect(reviewLink.querySelector('svg')).not.toBeNull()
      const dataPointLink = screen.getByRole('link', { name: 'Share a Data Point' })
      expect(dataPointLink).toHaveAttribute('href', '/data-points/create?topic_id=topic-1')
      expect(dataPointLink.querySelector('svg')).not.toBeNull()
      const discussionLink = screen.getByRole('link', { name: 'Start a Discussion' })
      expect(discussionLink).toHaveAttribute('href', '/discussions/create?topic_id=topic-1')
      expect(discussionLink.querySelector('svg')).not.toBeNull()
    })

    it('shows all three contribute links for bank_account topic', () => {
      render(
        <TopicActionsAside
          {...baseProps}
          topicType='bank_account'
        />,
      )

      expect(screen.getByRole('link', { name: 'Write a Review' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Share a Data Point' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Start a Discussion' })).toBeInTheDocument()
    })

    it('hides data point link for a non-data-point topic type', () => {
      render(
        <TopicActionsAside
          {...baseProps}
          topicType='topic'
        />,
      )

      expect(screen.queryByRole('link', { name: 'Share a Data Point' })).not.toBeInTheDocument()
    })

    it('hides data point link for referral_program topic', () => {
      render(
        <TopicActionsAside
          {...baseProps}
          topicType='referral_program'
        />,
      )

      expect(screen.queryByRole('link', { name: 'Share a Data Point' })).not.toBeInTheDocument()
    })

    it('hides review link but shows discussion when reviews are not allowed', () => {
      render(
        <TopicActionsAside
          {...baseProps}
          allowReviews={false}
        />,
      )

      expect(screen.queryByRole('link', { name: 'Write a Review' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Start a Discussion' })).toBeInTheDocument()
    })

    it('url-encodes topic_id with special characters', () => {
      render(
        <TopicActionsAside
          {...baseProps}
          topicId='a b&c'
        />,
      )

      const reviewLink = screen.getByRole('link', { name: 'Write a Review' })
      expect(reviewLink).toHaveAttribute('href', '/reviews/create?topic_id=a%20b%26c')
    })

    it('renders the mute button inside a ButtonGroup', () => {
      const { container } = render(<TopicActionsAside {...baseProps} />)
      expect(container.querySelector('[role="group"]')).not.toBeNull()
      const muteButton = mockEntityBookmarkButtonPropsList.find(p => p.preset === 'mute')
      expect(muteButton).toBeDefined()
    })
  })

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ currentUser: null })
    })

    it('renders the RSS feed link with a slug-based href', () => {
      render(<TopicActionsAside {...baseProps} />)

      const rssLink = screen.getByRole('link', { name: 'RSS Feed' })
      expect(rssLink).toHaveAttribute(
        'href',
        `/rss/posts?topics=${encodeURIComponent('trade-platform')}`,
      )
    })

    it('renders Mute as a login link with the mute intent', () => {
      render(<TopicActionsAside {...baseProps} />)

      expect(screen.getByRole('link', { name: 'Mute' })).toHaveAttribute(
        'href',
        MOCK_MUTE_LOGIN_HREF,
      )
    })

    it('renders the action links inside a ButtonGroup', () => {
      const { container } = render(<TopicActionsAside {...baseProps} />)
      expect(container.querySelector('[role="group"]')).not.toBeNull()
    })

    it('does not render any EntityBookmarkButton', () => {
      render(<TopicActionsAside {...baseProps} />)
      expect(mockEntityBookmarkButtonPropsList).toHaveLength(0)
    })

    it('hides the contribute section (create pages do not preserve topic_id after login)', () => {
      render(<TopicActionsAside {...baseProps} />)

      expect(screen.queryByRole('link', { name: 'Write a Review' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Share a Data Point' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Start a Discussion' })).not.toBeInTheDocument()
    })
  })
})
