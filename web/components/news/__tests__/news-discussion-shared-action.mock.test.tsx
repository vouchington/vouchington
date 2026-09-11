import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { NewsDiscussMenu } from '../news-discuss-menu'
import type { StartDiscussionAction } from '../use-start-discussion-action'

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
      default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
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

vi.mock(import('@/components/news/use-viewer-has-community'), () => ({
  useViewerHasCommunity: vi.fn<() => boolean>().mockReturnValue(false),
}))

describe('news discussion shared action', () => {
  it('uses the provided pending state — shows Creating... and disables the item', () => {
    const startDiscussionAction: StartDiscussionAction = {
      handleStartDiscussion: vi.fn<VitestLooseMock>(),
      isCreating: true,
      usernameDialogOpen: false,
      handleUsernameSet: vi.fn<VitestLooseMock>(),
      handleUsernameClose: vi.fn<VitestLooseMock>(),
    }

    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={[]}
        startDiscussionAction={startDiscussionAction}
      />,
    )

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled()
  })

  it('uses the provided handler when Discuss is clicked', () => {
    const startDiscussionAction: StartDiscussionAction = {
      handleStartDiscussion: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      isCreating: false,
      usernameDialogOpen: false,
      handleUsernameSet: vi.fn<VitestLooseMock>(),
      handleUsernameClose: vi.fn<VitestLooseMock>(),
    }

    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={[]}
        startDiscussionAction={startDiscussionAction}
      />,
    )

    const discussItem = container.querySelector('[data-pw="news-discuss-button"]') as HTMLElement
    fireEvent.click(discussItem)

    expect(startDiscussionAction.handleStartDiscussion).toHaveBeenCalled()
  })
})
