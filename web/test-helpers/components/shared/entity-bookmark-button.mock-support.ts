import { vi } from 'vitest'

const {
  mockBookmarkEntity,
  mockUnbookmarkEntity,
  mockGetEntityBookmarks,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockUnbookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
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

export {
  mockBookmarkEntity,
  mockUnbookmarkEntity,
  mockGetEntityBookmarks,
  mockToastError,
  mockToastSuccess,
}
