import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminSupportThreads } = vi.hoisted(() => ({
  mockGetAdminSupportThreads: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getAdminSupportThreads: mockGetAdminSupportThreads,
}))

vi.mock(import('./admin-support-threads-client'), () => ({
  AdminSupportThreadsClient: () => <div />,
}))

import AdminSupportPage from './page'

describe('AdminSupportPage', () => {
  beforeEach(() => {
    mockGetAdminSupportThreads.mockReset()
    mockGetAdminSupportThreads.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('normalizes repeated search parameters before loading the queue', async () => {
    await AdminSupportPage({
      searchParams: Promise.resolve({
        q: [' first ', 'second'],
        status: ['assigned', 'resolved'],
      }),
    })

    expect(mockGetAdminSupportThreads).toHaveBeenCalledWith({
      q: 'first',
      status: 'assigned',
      limit: 30,
    })
  })
})
