/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults, no-mistakes/playwright-consistent-attribute -- moved test support keeps the data-testid and data-pw attributes the news discuss menu tests query */

import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { mockLucideReact } from '@/test-helpers/lucide-icons'

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

vi.mock(import('@/lib/api/client/post-mutations'), () => ({
  createLinkPost: vi.fn<VitestLooseMock>(),
}))

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
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces menu items with native buttons the discuss tests click
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
    // ast-grep-ignore: web-no-raw-form-elements -- test double replaces menu items with native buttons the discuss tests click
    <button
      type='button'
      data-testid='community-discussion-action'
    >
      {fixedCommunity ? `Discuss in ${fixedCommunity.name}` : 'Discuss with Community'}
    </button>
  ),
}))
