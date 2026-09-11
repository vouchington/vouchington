import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyEmailAddressesClient } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { EmailAddress } from '@/types/user'
import { useEmailAddressPagination } from './use-email-address-pagination'

vi.mock(import('@/lib/api/client'), () => ({
  getMyEmailAddressesClient: vi.fn<VitestLooseMock>(),
}))

const getPage = vi.mocked(getMyEmailAddressesClient)
const emailAddresses = {
  boundary: 'tests+b0a0da71@voucha.ai',
  existing: 'tests+e6157100@voucha.ai',
  newlyVerified: 'tests+0e7f1ed0@voucha.ai',
  oldPrimary: 'tests+01d9a1a0@voucha.ai',
  primary: 'tests+a11ce001@voucha.ai',
  promoted: 'tests+f20a07ed@voucha.ai',
} as const

describe('useEmailAddressPagination mutation resets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('drops stale accumulated pages after promoting an email from page two', async () => {
    const first = page(
      [email(emailAddresses.oldPrimary, true), email(emailAddresses.boundary)],
      'old-cursor',
    )
    getPage.mockResolvedValueOnce(page([email(emailAddresses.promoted)], null))
    const { result } = renderHook(() => useEmailAddressPagination(first))
    await act(async () => result.current.pagination.loadMore())

    const promotedFirstPage = page(
      [email(emailAddresses.promoted, true), email(emailAddresses.oldPrimary)],
      'new-cursor',
    )
    act(() => result.current.resetToFirstPage?.(promotedFirstPage))

    expect(result.current.emails.map(item => item.email_address)).toEqual([
      emailAddresses.promoted,
      emailAddresses.oldPrimary,
    ])
    expect(result.current.pagination.pages).toEqual([promotedFirstPage])
    expect(result.current.pagination.endCursor).toBe('new-cursor')
  })

  it('uses the returned cursor to reach a newly verified email after a terminal page', async () => {
    const first = page([email(emailAddresses.primary, true)], 'old-cursor')
    getPage
      .mockResolvedValueOnce(page([email(emailAddresses.existing)], null))
      .mockResolvedValueOnce(
        page([email(emailAddresses.existing), email(emailAddresses.newlyVerified)], null),
      )
    const { result } = renderHook(() => useEmailAddressPagination(first))
    await act(async () => result.current.pagination.loadMore())

    const verifiedFirstPage = page([email(emailAddresses.primary, true)], 'verification-cursor')
    act(() => result.current.resetToFirstPage?.(verifiedFirstPage))
    expect(result.current.pagination.hasNextPage).toBe(true)

    await act(async () => result.current.pagination.loadMore())
    expect(getPage).toHaveBeenLastCalledWith({ after: 'verification-cursor' })
    expect(result.current.emails.map(item => item.email_address)).toEqual([
      emailAddresses.primary,
      emailAddresses.existing,
      emailAddresses.newlyVerified,
    ])
  })
})

function email(emailAddress: string, isPrimary = false): EmailAddress {
  return {
    email_address: emailAddress,
    is_primary: isPrimary,
    created_at: '2026-07-18T00:00:00.000Z',
  }
}

function page(results: EmailAddress[], endCursor: string | null): ListResponse<EmailAddress> {
  return {
    results,
    page_info: {
      has_next_page: endCursor !== null,
      start_cursor: results[0]?.email_address ?? null,
      end_cursor: endCursor,
    },
  }
}
