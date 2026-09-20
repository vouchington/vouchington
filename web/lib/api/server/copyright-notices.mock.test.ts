import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockReturnNull } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockReturnNull: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () => ({ serverApi: { get: mockGet } }) as unknown as typeof import('./instance'),
)

vi.mock(
  import('../return-null-for-missing-entity'),
  () =>
    ({
      returnNullForMissingEntity: mockReturnNull,
    }) as unknown as typeof import('../return-null-for-missing-entity'),
)

import { getCopyrightNotices, getCopyrightParticipantNoticeServer } from './copyright-notices'
import type {
  CopyrightNoticesPage,
  CopyrightParticipantNoticeDetail,
} from '@/types/copyright-notices'

describe('copyright notice server API helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNull.mockReset()
  })

  it('forwards accepted-case cursor pagination options', async () => {
    const response: CopyrightNoticesPage = {
      copyright_notices: [],
      page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'next' },
    }
    mockGet.mockResolvedValue(response)

    await expect(getCopyrightNotices({ after: 'next', limit: 100 })).resolves.toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/copyright-notices', {
      searchParams: { after: 'next', limit: 100 },
    })
  })

  it('treats a non-participant response as an optional detail panel without broad error masking', async () => {
    const request = Promise.resolve({ copyright_notice: {} as CopyrightParticipantNoticeDetail })
    mockGet.mockReturnValue(request)
    mockReturnNull.mockResolvedValue(null)

    await expect(getCopyrightParticipantNoticeServer('notice-id')).resolves.toBeNull()
    expect(mockReturnNull).toHaveBeenCalledWith(request, { nullStatusCodes: [403, 404] })
  })
})
