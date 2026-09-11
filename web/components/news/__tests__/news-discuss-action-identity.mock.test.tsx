import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { NewsDiscussMenu } from '../news-discuss-menu'
import { ApiError } from '@/lib/api/error'
import { toast } from 'sonner'

const mockPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    MessageSquare: () => null,
    MessageSquarePlus: () => null,
    Plus: () => null,
  }),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const { mockCreateLinkPost } = vi.hoisted(() => ({
  mockCreateLinkPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  createLinkPost: mockCreateLinkPost,
}))

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({
        children,
        disabled,
        onSelect,
        'data-pw': dataPw,
      }: {
        children: ReactNode
        disabled?: boolean
        onSelect?: (event: { preventDefault: () => void }) => void
        'data-pw'?: string
      }) => (
        <button
          type='button'
          data-pw={dataPw}
          disabled={disabled}
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

vi.mock(import('@/components/news/use-viewer-has-community'), () => ({
  useViewerHasCommunity: vi.fn<() => boolean>().mockReturnValue(false),
}))

describe('IDENTITY_REQUIRED gate — global Discuss', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockCreateLinkPost.mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('opens the username dialog instead of toasting on IDENTITY_REQUIRED', async () => {
    mockCreateLinkPost.mockRejectedValue(
      new ApiError('An identity is required to create posts', 403, { code: 'IDENTITY_REQUIRED' }),
    )

    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={[]}
      />,
    )

    fireEvent.click(container.querySelector('[data-pw="news-discuss-button"]') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('username-required-dialog-stub')).toBeDefined()
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('retries createLinkPost after username is set', async () => {
    mockCreateLinkPost
      .mockRejectedValueOnce(
        new ApiError('An identity is required to create posts', 403, { code: 'IDENTITY_REQUIRED' }),
      )
      .mockResolvedValueOnce({
        post: {
          id: 'post-1',
          slug: 'new-link-abc123',
          post_type: 'link',
          title: 'My Link Post',
          markdown: '',
          ai_summary_markdown: null,
          broadcast: 'everyone',
          privacy: 'public',
          clearance_status: 'approved',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          user_id: 'user-1',
        },
      })

    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={[]}
      />,
    )
    fireEvent.click(container.querySelector('[data-pw="news-discuss-button"]') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('username-required-dialog-stub')).toBeDefined()
    })
    fireEvent.click(screen.getByTestId('username-dialog-set'))

    await waitFor(() => {
      expect(mockCreateLinkPost).toHaveBeenCalledTimes(2)
      expect(mockPush).toHaveBeenCalledWith('/link/new-link-abc123')
    })
  })
})
