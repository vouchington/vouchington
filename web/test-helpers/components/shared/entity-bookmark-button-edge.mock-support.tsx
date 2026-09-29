import type { ReactNode } from 'react'
import { vi } from 'vitest'

vi.mock(
  import('@/components/ui/tooltip'),
  () =>
    ({
      Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipContent: ({ children }: { children: ReactNode }) => (
        <span role='tooltip'>{children}</span>
      ),
      TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
    }) as unknown as typeof import('@/components/ui/tooltip'),
)

const {
  mockBookmarkEntity,
  mockUnbookmarkEntity,
  mockGetEntityBookmarks,
  mockToastError,
  mockToastSuccess,
  mockIsRateLimitError,
  mockGetRateLimitMessage,
} = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockUnbookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockIsRateLimitError: vi.fn<VitestLooseMock>().mockReturnValue(false),
  mockGetRateLimitMessage: vi.fn<VitestLooseMock>().mockReturnValue('Rate limited'),
}))

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: mockBookmarkEntity,
  unbookmarkEntity: mockUnbookmarkEntity,
  getEntityBookmarks: mockGetEntityBookmarks,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        error: mockToastError,
        success: mockToastSuccess,
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(
  import('@/lib/api/rate-limit-error'),
  () =>
    ({
      isRateLimitError: mockIsRateLimitError,
      getRateLimitMessage: mockGetRateLimitMessage,
    }) as unknown as typeof import('@/lib/api/rate-limit-error'),
)

function resetEntityBookmarkEdgeDoubles() {
  vi.clearAllMocks()
  mockBookmarkEntity.mockReset()
  mockUnbookmarkEntity.mockReset()
  mockGetEntityBookmarks.mockReset()
  mockToastError.mockReset()
  mockIsRateLimitError.mockReset().mockReturnValue(false)
  mockGetRateLimitMessage.mockReset().mockReturnValue('Rate limited')
}

export {
  mockBookmarkEntity,
  mockGetEntityBookmarks,
  mockGetRateLimitMessage,
  mockIsRateLimitError,
  mockToastError,
  resetEntityBookmarkEdgeDoubles,
}
