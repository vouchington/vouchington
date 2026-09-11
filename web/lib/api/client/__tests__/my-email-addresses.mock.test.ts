import { describe, expect, it, vi } from 'vitest'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: { get: mockGet, post: mockPost },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import {
  getMyEmailAddressesClient,
  getMySpendingCategoriesClient,
  requestMyEmailAddressVerification,
} from '@/lib/api/client/my'

describe('my email address client helpers', () => {
  it('forwards the continuation cursor and limit', async () => {
    const page = {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    mockGet.mockResolvedValueOnce(page)

    const result = await getMyEmailAddressesClient({ after: 'cursor-1', limit: 25 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/email-addresses', {
      searchParams: { after: 'cursor-1', limit: 25 },
    })
    expect(result).toBe(page)
  })

  it('requests verification for the supplied email address', async () => {
    mockPost.mockResolvedValue({ email_address: 'tests+client@voucha.ai' })

    await requestMyEmailAddressVerification('Tests+Client@Voucha.ai')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/my/email-addresses', {
      email_address: 'Tests+Client@Voucha.ai',
    })
  })

  it('forwards spending-category pagination without unbounded requests', async () => {
    const page = {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    mockGet.mockResolvedValueOnce(page)

    const result = await getMySpendingCategoriesClient({
      after: 'opaque-cursor',
      limit: 25,
    })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/spending-categories', {
      searchParams: { after: 'opaque-cursor', limit: 25 },
    })
    expect(result).toBe(page)
  })
})
