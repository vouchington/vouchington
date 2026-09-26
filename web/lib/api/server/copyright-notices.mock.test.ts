import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockReturnNull } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockReturnNull: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () => ({ serverApi: { get: mockGet } }) as unknown as typeof import('./instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

vi.mock(
  import('../return-null-for-missing-entity'),
  () =>
    ({
      returnNullForMissingEntity: mockReturnNull,
    }) as unknown as typeof import('../return-null-for-missing-entity'),
)

import {
  getCopyrightEmailIntakeReviewQueue,
  getCopyrightNoticeServer,
  getCopyrightNotices,
  getCopyrightParticipantNoticeServer,
  getCopyrightReviewQueue,
} from './copyright-notices'
import type {
  CopyrightNoticeDetail,
  CopyrightNoticesPage,
  CopyrightParticipantNoticeDetail,
} from '@/types/copyright-notices'
import {
  makeCopyrightEmailQueueItem,
  makeCopyrightEmailQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'

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

  it('unwraps public notice and preserves staff queue pagination', async () => {
    const notice = { id: 'notice-1' } as CopyrightNoticeDetail
    mockReturnNull.mockImplementation(async (request: Promise<unknown>) => request)
    const staffPage = {
      copyright_notices: [{ id: 'notice-1' }],
      page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'next' },
    }
    const emailPage = makeCopyrightEmailQueuePage([makeCopyrightEmailQueueItem()], {
      has_next_page: true,
      end_cursor: 'next',
    })
    mockGet
      .mockResolvedValueOnce({ copyright_notice: notice })
      .mockResolvedValueOnce(staffPage)
      .mockResolvedValueOnce(emailPage)

    await expect(getCopyrightNoticeServer('notice-1')).resolves.toBe(notice)
    await expect(getCopyrightReviewQueue()).resolves.toBe(staffPage)
    await expect(getCopyrightEmailIntakeReviewQueue()).resolves.toBe(emailPage)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/copyright-notices/review-queue')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/copyright-email-intakes/review-queue')
  })

  it('renders an unpaginated email intake queue as its final page', async () => {
    const items = [makeCopyrightEmailQueueItem()]
    mockGet.mockResolvedValue({ copyright_email_intakes: items })

    await expect(getCopyrightEmailIntakeReviewQueue()).resolves.toEqual(
      makeCopyrightEmailQueuePage(items, { start_cursor: null }),
    )
  })
})
