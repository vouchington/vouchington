import { vi } from 'vitest'

const { mockGetModmailInboxServer } = vi.hoisted(() => ({
  mockGetModmailInboxServer: vi.fn<VitestLooseMock>(),
}))

export { mockGetModmailInboxServer }

vi.mock(import('@/lib/api/server/modmail'), () => ({
  getModmailInboxServer: mockGetModmailInboxServer,
}))

vi.mock(import('@/components/communities/modmail-inbox'), () => ({
  ModmailInbox: ({ initialData }: { initialData: { results: unknown[] } | null }) => (
    <div data-pw='modmail-inbox'>{`modmail-inbox:${initialData?.results.length ?? 'error'}`}</div>
  ),
}))

export function resetCommunityModerationModmailMocks() {
  mockGetModmailInboxServer.mockReset()
  mockGetModmailInboxServer.mockResolvedValue({
    results: [{ id: 'thread-one' }],
    page_info: {
      has_next_page: true,
      start_cursor: 'start-one',
      end_cursor: 'end-one',
    },
  })
}
