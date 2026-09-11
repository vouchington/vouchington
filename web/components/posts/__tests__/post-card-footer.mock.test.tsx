import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostCardFooter } from '../post-card/post-card-footer'
import type { Post } from '@/types/posts'

let mockIsAuthenticated = false

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        className?: string
      }) => <a href={href}>{children}</a>,
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    MessageSquare: () => <svg data-testid='message-square-icon' />,
  }),
)

vi.mock(
  import('@/components/shared/agent-badge'),
  () =>
    ({
      AgentBadge: () => null,
    }) as unknown as typeof import('@/components/shared/agent-badge'),
)

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: () => (
    <button
      type='button'
      aria-label='Hide'
      data-testid='hide-button'
    />
  ),
}))

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: () => (
    <button
      type='button'
      aria-label='Save'
      data-testid='save-button'
    />
  ),
}))

vi.mock(import('@/components/shared/time-ago'), () => ({
  TimeAgo: () => <span>Jan 1, 2026</span>,
}))

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: ({ policy = 'sentiment' }: { policy?: string }) => (
    <div data-testid='score-vote-policy'>{policy}</div>
  ),
}))

vi.mock(
  import('@/components/users/user-link'),
  () =>
    ({
      UserLink: () => null,
    }) as unknown as typeof import('@/components/users/user-link'),
)

vi.mock(
  import('@/components/shared/report-menu-item'),
  () =>
    ({
      ReportMenuKebab: () => null,
    }) as unknown as typeof import('@/components/shared/report-menu-item'),
)

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: mockIsAuthenticated }),
}))

vi.mock(import('@/lib/i18n/ui-locale-context'), () => ({
  useUiLocale: () => 'en-US',
}))

vi.mock(import('@/lib/api/client/elections'), async importOriginal => ({
  ...(await importOriginal()),
  clearPostVote: vi.fn<VitestLooseMock>(),
  isRecommendationChoice: (choice?: string) => choice === 'support' || choice === 'oppose',
  isSentimentChoice: (choice?: string) => choice === 'like' || choice === 'dislike',
  submitPostRecommendationVote: vi.fn<VitestLooseMock>(),
  submitPostVote: vi.fn<VitestLooseMock>(),
}))

const post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test discussion',
  markdown: 'Body',
  root_id: null,
  parent_id: null,
  created_by_id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
} as Post

describe('PostCardFooter', () => {
  beforeEach(() => {
    mockIsAuthenticated = false
  })

  it('uses the canonical discussion icon for comment counts', () => {
    render(
      <PostCardFooter
        post={post}
        routePath='discussion'
        commentCount={3}
        hideDownCount={false}
        initialSaved={false}
        initialHidden={false}
      />,
    )

    expect(screen.getByRole('link', { name: '3 comments' })).toContainElement(
      screen.getByTestId('message-square-icon'),
    )
  })

  it('uses the recommendation ballot for topic-recommendation posts', () => {
    render(
      <PostCardFooter
        post={{ ...post, post_type: 'topic_recommendation' }}
        routePath='topic-recommendation'
        election={{
          __entity_type: 'post_election',
          id: 'post-1',
          votes_score_net: 1,
          votes_count_up: 2,
          votes_count_down: 1,
        }}
        electionVote={{
          __entity_type: 'election_vote',
          entity_id: post.id,
          user_id: 'user-1',
          choice: 'support',
          created_at: '2026-01-01T00:00:00Z',
        }}
        commentCount={0}
        hideDownCount={false}
        initialSaved={false}
        initialHidden={false}
      />,
    )

    expect(screen.getByTestId('score-vote-policy')).toHaveTextContent('recommendation')
  })

  describe('hideBookmarkActions', () => {
    it('suppresses SaveButton and HideButton when hideBookmarkActions=true and authenticated', () => {
      mockIsAuthenticated = true
      render(
        <PostCardFooter
          post={post}
          routePath='discussion'
          commentCount={0}
          hideDownCount={false}
          initialSaved={false}
          initialHidden={false}
          hideBookmarkActions
        />,
      )
      expect(screen.queryByTestId('save-button')).toBeNull()
      expect(screen.queryByTestId('hide-button')).toBeNull()
    })

    it('renders SaveButton and HideButton when hideBookmarkActions=false and authenticated', () => {
      mockIsAuthenticated = true
      render(
        <PostCardFooter
          post={post}
          routePath='discussion'
          commentCount={0}
          hideDownCount={false}
          initialSaved={false}
          initialHidden={false}
          hideBookmarkActions={false}
        />,
      )
      expect(screen.getByTestId('save-button')).toBeDefined()
      expect(screen.getByTestId('hide-button')).toBeDefined()
    })
  })
})
