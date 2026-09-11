import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostDetailActions } from '../post-detail-actions'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = { id: 'user-1' } as User

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

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

vi.mock(import('@/lib/api/client/elections'), async importOriginal => ({
  ...(await importOriginal()),
  clearPostVote: vi.fn<VitestLooseMock>(),
  isRecommendationChoice: (choice?: string) => choice === 'support' || choice === 'oppose',
  isSentimentChoice: (choice?: string) => choice === 'like' || choice === 'dislike',
  submitPostRecommendationVote: vi.fn<VitestLooseMock>(),
  submitPostVote: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: ({ policy = 'sentiment' }: { policy?: string }) => (
    <div data-testid='score-vote'>{policy}</div>
  ),
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: () => (
    <button
      type='button'
      data-pw='hide-button'
    >
      Hide
    </button>
  ),
}))

vi.mock(import('../discuss-in-community-action'), () => ({
  DiscussInCommunityAction: () => <button type='button'>Discuss in community</button>,
}))

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: ({ 'data-pw': dataPw }: { 'data-pw'?: string }) => (
    <button
      type='button'
      aria-label='Save'
      data-pw={dataPw}
    >
      Save
    </button>
  ),
}))

const basePost = {
  id: 'post-1',
  postType: 'discussion' as const,
  title: 'Test Post',
  canDiscussInCommunity: true,
  discussionSource: { title: 'Test Post', canonicalPath: '/discussion/post-1' },
}

const defaultProps = {
  hideDownCount: false,
  post: basePost,
}

describe('PostDetailActions', () => {
  beforeEach(() => {
    mockCurrentUser = { id: 'user-1' } as User
  })

  it('signed-out: no Save or Hide buttons', () => {
    mockCurrentUser = null

    render(<PostDetailActions {...defaultProps} />)
    expect(screen.queryByText('Save')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull()
  })

  it('signed-in: Save and Hide buttons visible', () => {
    render(<PostDetailActions {...defaultProps} />)
    expect(screen.getByText('Save')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDefined()
  })

  it('does not render comment count in the action row', () => {
    render(<PostDetailActions {...defaultProps} />)
    expect(screen.queryByText(/comments/)).toBeNull()
  })

  it('Save button has data-pw="post-save-button"', () => {
    render(<PostDetailActions {...defaultProps} />)
    const saveBtn = screen.getByText('Save')
    expect(saveBtn.getAttribute('data-pw')).toBe('post-save-button')
  })

  it('Hide button has data-pw="hide-button"', () => {
    render(<PostDetailActions {...defaultProps} />)
    const hideBtn = screen.getByRole('button', { name: 'Hide' })
    expect(hideBtn.getAttribute('data-pw')).toBe('hide-button')
  })

  it('uses the recommendation ballot for a topic-recommendation detail', () => {
    render(
      <PostDetailActions
        {...defaultProps}
        election={{ id: 'post-1', votesCountUp: 2, votesCountDown: 1 }}
        existingVoteChoice='support'
        post={{ ...basePost, postType: 'topic_recommendation' }}
      />,
    )

    expect(screen.getByTestId('score-vote')).toHaveTextContent('recommendation')
  })
})
