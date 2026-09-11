import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { NewsCommunityDiscussionAction } from '../news-community-discussion-action'
import { ApiError } from '@/lib/api/error'
import onError from '@/lib/on-error'
import {
  createLinkedCommunityDiscussion,
  loadAvailableCommunities,
} from '../news-community-discussion-helpers'

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

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-recaptcha-token'), () => ({
  useRecaptchaToken: () => ({ execute: vi.fn<VitestLooseMock>().mockResolvedValue('recaptcha') }),
}))

vi.mock(
  import('@/hooks/use-turnstile-token'),
  () =>
    ({
      useTurnstileToken: () => ({
        token: 'turnstile',
        reset: mockTurnstileReset,
        alwaysApprove: false,
      }),
    }) as unknown as typeof import('@/hooks/use-turnstile-token'),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({
        children,
        onSelect,
        'data-pw': dataPw,
      }: {
        children: ReactNode
        onSelect?: (event: { preventDefault: () => void }) => void
        'data-pw'?: string
      }) => (
        <button
          type='button'
          data-pw={dataPw}
          onClick={() => onSelect?.({ preventDefault: vi.fn<VitestLooseMock>() })}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/shared/username-required-dialog'),
  () =>
    ({
      UsernameRequiredDialog: ({
        open,
        onUsernameSet,
        onClose,
      }: {
        open: boolean
        onUsernameSet: () => void
        onClose: () => void
      }) =>
        open ? (
          <div data-testid='username-required-dialog-stub'>
            <button
              type='button'
              data-testid='username-dialog-set'
              onClick={onUsernameSet}
            >
              Set username
            </button>
            <button
              type='button'
              data-testid='username-dialog-close'
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : null,
    }) as unknown as typeof import('@/components/shared/username-required-dialog'),
)

vi.mock(import('../news-community-discussion-helpers'), async () => {
  const actual = await vi.importActual<typeof import('../news-community-discussion-helpers')>(
    '../news-community-discussion-helpers',
  )
  return {
    ...actual,
    loadAvailableCommunities: vi.fn<VitestLooseMock>(),
    createLinkedCommunityDiscussion: vi.fn<VitestLooseMock>(),
  }
})

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

describe('IDENTITY_REQUIRED gate — community Discuss', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockTurnstileReset.mockReset()
    mockCreateLinkedCommunityDiscussion.mockReset()
    mockLoadAvailableCommunities.mockReset()
    mockOnError.mockReset()
    mockLoadAvailableCommunities.mockResolvedValue([rewards])
  })

  it('opens username dialog without resetting Turnstile on IDENTITY_REQUIRED', async () => {
    mockCreateLinkedCommunityDiscussion.mockRejectedValue(
      new ApiError('An identity is required to create posts', 403, { code: 'IDENTITY_REQUIRED' }),
    )

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
      expect(screen.getByTestId('username-dialog-set')).toBeDefined()
    })
    expect(mockTurnstileReset).not.toHaveBeenCalled()
    expect(mockOnError).not.toHaveBeenCalled()
  })

  it('retries createLinkedCommunityDiscussion after username is set', async () => {
    mockCreateLinkedCommunityDiscussion
      .mockRejectedValueOnce(
        new ApiError('An identity is required to create posts', 403, { code: 'IDENTITY_REQUIRED' }),
      )
      .mockResolvedValueOnce({
        post: {
          id: 'post-2',
          post_type: 'discussion' as const,
          slug: 'created-discussion',
        },
        communityPostReview: undefined,
      } as unknown as Awaited<ReturnType<typeof createLinkedCommunityDiscussion>>)

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
      expect(screen.getByTestId('username-dialog-set')).toBeDefined()
    })
    fireEvent.click(screen.getByTestId('username-dialog-set'))

    await waitFor(() => {
      expect(mockCreateLinkedCommunityDiscussion).toHaveBeenCalledTimes(2)
      expect(mockPush).toHaveBeenCalledWith('/discussion/created-discussion')
    })
  })
})
