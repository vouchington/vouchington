import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import {
  createLinkedCommunityDiscussion,
  loadAvailableCommunities,
} from '../news-community-discussion-helpers'
import { NewsCommunityDiscussionAction } from '../news-community-discussion-action'

const mockPush = vi.fn<VitestLooseMock>()
const mockTurnstileReset = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    MessageSquare: () => null,
    MessageSquarePlus: () => null,
  }),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({
        children,
        onSelect,
      }: {
        children: ReactNode
        onSelect?: (event: { preventDefault: () => void }) => void
      }) => (
        <button
          type='button'
          onClick={() => onSelect?.({ preventDefault: vi.fn<VitestLooseMock>() })}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(import('@/hooks/use-recaptcha-token'), () => ({
  useRecaptchaToken: () => ({ execute: vi.fn<VitestLooseMock>().mockResolvedValue('recaptcha') }),
}))

vi.mock(
  import('@/hooks/use-turnstile-token'),
  () =>
    ({
      useTurnstileToken: () => ({ token: 'turnstile', reset: mockTurnstileReset }),
    }) as unknown as typeof import('@/hooks/use-turnstile-token'),
)

vi.mock(import('@/lib/api/client/posts'), () => ({}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../news-community-discussion-helpers'), async () => {
  const actual = await vi.importActual<typeof import('../news-community-discussion-helpers')>(
    '../news-community-discussion-helpers',
  )
  return {
    ...actual,
    createLinkedCommunityDiscussion: vi.fn<VitestLooseMock>(),
    loadAvailableCommunities: vi.fn<VitestLooseMock>(),
  }
})

vi.mock(
  import('@/components/shared/username-required-dialog'),
  () =>
    ({
      UsernameRequiredDialog: ({
        open,
        onUsernameSet,
      }: {
        open: boolean
        onUsernameSet: () => void
      }) =>
        open ? (
          <button
            type='button'
            data-testid='username-dialog-set'
            onClick={onUsernameSet}
          >
            Set username
          </button>
        ) : null,
    }) as unknown as typeof import('@/components/shared/username-required-dialog'),
)

vi.mock(import('../news-community-discussion-dialog'), () => ({
  NewsCommunityDiscussionDialog: ({
    open,
    communities,
    onSubmit,
  }: {
    open: boolean
    communities: Array<{ name: string }>
    onSubmit: () => void
  }) => (
    <div data-open={String(open)}>
      {communities.map(community => (
        <span key={community.name}>{community.name}</span>
      ))}
      <button
        type='button'
        onClick={onSubmit}
      >
        Submit dialog
      </button>
    </div>
  ),
}))

const mockCreateLinkedCommunityDiscussion = vi.mocked(createLinkedCommunityDiscussion)
const mockLoadAvailableCommunities = vi.mocked(loadAvailableCommunities)
const mockOnError = vi.mocked(onError)

const relatedUrls = [{ id: 'url-1', url: 'https://example.com/article' }]
const rewards = {
  id: 'community-1',
  name: 'Rewards',
  slug: 'rewards',
  visibility: 'public' as const,
  post_approval_required_at: null,
}

describe('NewsCommunityDiscussionAction', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockTurnstileReset.mockReset()
    mockCreateLinkedCommunityDiscussion.mockReset()
    mockLoadAvailableCommunities.mockReset()
    mockOnError.mockReset()
    mockCreateLinkedCommunityDiscussion.mockResolvedValue({
      post: {
        id: 'post-1',
        post_type: 'discussion',
        title: 'Created discussion',
        slug: 'created-discussion',
        markdown: '',
        root_id: null,
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
        community_id: 'community-1',
        clearance_status: 'approved',
      },
      communityPostReview: undefined,
    })
  })

  it('loads communities and creates a selected community discussion from the button variant', async () => {
    mockLoadAvailableCommunities.mockResolvedValue([rewards])

    render(
      <NewsCommunityDiscussionAction
        itemTitle='Article'
        relatedUrls={relatedUrls}
        variant='button'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discuss' }))
    await screen.findByText('Rewards')
    fireEvent.click(screen.getByRole('button', { name: 'Submit dialog' }))
    await waitFor(() => {
      expect(mockCreateLinkedCommunityDiscussion).toHaveBeenCalledWith(rewards, relatedUrls, {
        isPrivateCommunity: false,
        itemTitle: 'Article',
        recaptchaToken: 'recaptcha',
        turnstileToken: 'turnstile',
      })
      expect(mockPush).toHaveBeenCalledWith('/discussion/created-discussion')
    })
  })
  it('creates fixed private-community discussions from the menu item variant', async () => {
    render(
      <NewsCommunityDiscussionAction
        fixedCommunity={{
          ...rewards,
          name: 'Private Rewards',
          slug: 'private-rewards',
          visibility: 'private',
          post_approval_required_at: '2026-01-01T00:00:00Z',
        }}
        relatedUrls={relatedUrls}
        variant='menu-item'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discuss in Private Rewards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit dialog' }))
    await waitFor(() => {
      expect(mockCreateLinkedCommunityDiscussion).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'community-1', slug: 'private-rewards' }),
        relatedUrls,
        expect.objectContaining({ isPrivateCommunity: true }),
      )
    })
    expect(mockPush).toHaveBeenCalledWith(communityPendingPostsHref({ slug: 'private-rewards' }))
  })
  it('redirects raid-mode pending discussions from response metadata', async () => {
    mockCreateLinkedCommunityDiscussion.mockResolvedValue({
      post: {
        id: 'post-1',
        post_type: 'discussion',
        title: 'Created discussion',
        slug: 'created-discussion',
        markdown: '',
        root_id: null,
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
        community_id: 'community-1',
        clearance_status: 'approved',
      },
      communityPostReview: {
        community_id: 'community-1',
        post_id: 'post-1',
        approved_at: null,
        rejected_at: null,
        unpublished_at: null,
      },
    })
    render(
      <NewsCommunityDiscussionAction
        fixedCommunity={{ ...rewards, slug: 'raid-rewards' }}
        relatedUrls={relatedUrls}
        variant='menu-item'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discuss in Rewards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit dialog' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(communityPendingPostsHref({ slug: 'raid-rewards' }))
    })
  })
  it('reports community loading failures', async () => {
    mockLoadAvailableCommunities.mockRejectedValue(new Error('load failed'))
    render(
      <NewsCommunityDiscussionAction
        relatedUrls={relatedUrls}
        variant='button'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discuss' }))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(null, {
        fallback: 'Could not load your communities.',
        skipSentry: true,
      })
    })
  })
  it('resets Turnstile and reports submit failures', async () => {
    mockLoadAvailableCommunities.mockResolvedValue([rewards])
    mockCreateLinkedCommunityDiscussion.mockRejectedValue(new Error('create failed'))
    render(
      <NewsCommunityDiscussionAction
        relatedUrls={relatedUrls}
        variant='button'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discuss' }))
    await screen.findByText('Rewards')
    fireEvent.click(screen.getByRole('button', { name: 'Submit dialog' }))
    await waitFor(() => {
      expect(mockTurnstileReset).toHaveBeenCalled()
      expect(mockOnError).toHaveBeenCalledWith(new Error('create failed'), {
        fallback: 'Could not start discussion.',
      })
    })
  })
})
