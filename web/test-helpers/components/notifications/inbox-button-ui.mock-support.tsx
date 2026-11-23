import type { ReactNode } from 'react'
import { vi } from 'vitest'

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children, open }: { children: ReactNode; open?: boolean }) =>
        open ? <div>{children}</div> : <div data-dropdown-closed>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuSeparator: () => <hr />,
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/ui/tooltip'),
  () =>
    ({
      TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      TooltipContent: () => null,
    }) as unknown as typeof import('@/components/ui/tooltip'),
)

vi.mock(
  import('@/components/ui/scroll-area'),
  () =>
    ({
      ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/scroll-area'),
)
