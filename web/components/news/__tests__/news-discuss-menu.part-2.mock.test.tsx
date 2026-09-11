import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { useViewerHasCommunity } from '@/components/news/use-viewer-has-community'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
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

vi.mock(import('@/lib/api/client/posts'), () => ({
  createLinkPost: vi.fn<VitestLooseMock>(),
}))

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

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuSeparator: () => <hr data-testid='dropdown-separator' />,
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

vi.mock(import('@/components/news/use-viewer-has-community'), () => ({
  useViewerHasCommunity: vi.fn<() => boolean>().mockReturnValue(false),
}))

vi.mock(import('@/components/news/news-community-discussion-action'), () => ({
  NewsCommunityDiscussionAction: ({ fixedCommunity }: { fixedCommunity?: { name: string } }) => (
    <button
      type='button'
      data-testid='community-discussion-action'
    >
      {fixedCommunity ? `Discuss in ${fixedCommunity.name}` : 'Discuss with Community'}
    </button>
  ),
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { NewsDiscussMenu } from '../news-discuss-menu'

const EMPTY_URLS: Array<{ id: string; url: string }> = []
const mockUseViewerHasCommunity = vi.mocked(useViewerHasCommunity)

describe('NewsDiscussMenu part 2', () => {
  it('community item hidden when viewerHasCommunity=false and no communityDiscussionTarget', () => {
    mockUseViewerHasCommunity.mockReturnValue(false)
    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.queryByTestId('community-discussion-action')).toBeNull()
  })

  it('community item shown when viewerHasCommunity=true', () => {
    mockUseViewerHasCommunity.mockReturnValue(true)
    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByTestId('community-discussion-action')).toBeDefined()
  })

  it('community item shown when communityDiscussionTarget provided (viewerHasCommunity=false)', () => {
    mockUseViewerHasCommunity.mockReturnValue(false)
    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
        communityDiscussionTarget={{
          id: 'c1',
          name: 'Rewards',
          slug: 'rewards',
          visibility: 'public',
        }}
      />,
    )
    expect(screen.getByTestId('community-discussion-action')).toBeDefined()
  })

  it('data-pw="news-discuss-button" present in collapsed single-discuss branch', () => {
    mockUseViewerHasCommunity.mockReturnValue(false)
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(container.querySelector('[data-pw="news-discuss-button"]')).not.toBeNull()
  })

  it('data-pw="news-discuss-create-item" on the create action item in dropdown', () => {
    mockUseViewerHasCommunity.mockReturnValue(true)
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(container.querySelector('[data-pw="news-discuss-create-item"]')).not.toBeNull()
  })

  it('shows community item in dropdown when viewerHasCommunity=true alongside canDiscuss', () => {
    mockUseViewerHasCommunity.mockReturnValue(true)
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByTestId('community-discussion-action')).toBeDefined()
    expect(container.querySelector('[data-pw="news-discuss-create-item"]')).not.toBeNull()
  })
})
