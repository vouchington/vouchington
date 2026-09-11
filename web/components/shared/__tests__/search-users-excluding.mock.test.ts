import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UserSearchResult } from '@/types/user'
import type { UsersSearchResponseBody } from '@/types/api-responses'

const { mockSearchUsers } = vi.hoisted(() => ({
  mockSearchUsers: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/users'),
  () =>
    ({
      searchUsers: mockSearchUsers,
    }) as unknown as typeof import('@/lib/api/client/users'),
)

import { searchUsersExcluding } from '../search-users-excluding'

function makeUser(id: string): UserSearchResult {
  return { id, username: id }
}

function makePage(
  ids: string[],
  pageInfo: Partial<UsersSearchResponseBody['page_info']> = {},
): UsersSearchResponseBody {
  return {
    results: ids.map(makeUser),
    page_info: {
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
      ...pageInfo,
    },
  }
}

describe('searchUsersExcluding', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] without calling the API for a blank query', async () => {
    const result = await searchUsersExcluding('   ', new Set())

    expect(result).toEqual([])
    expect(mockSearchUsers).not.toHaveBeenCalled()
  })

  it('returns the first page unfiltered when nothing is excluded', async () => {
    mockSearchUsers.mockResolvedValueOnce(makePage(['u-1', 'u-2']))

    const result = await searchUsersExcluding('ada', new Set())

    expect(result.map(u => u.id)).toEqual(['u-1', 'u-2'])
    expect(mockSearchUsers).toHaveBeenCalledTimes(1)
    expect(mockSearchUsers).toHaveBeenCalledWith({
      q: 'ada',
      after: undefined,
      limit: 10,
      signal: undefined,
    })
  })

  it('trims the query and forwards the abort signal', async () => {
    mockSearchUsers.mockResolvedValueOnce(makePage(['u-1']))
    const controller = new AbortController()

    await searchUsersExcluding('  ada  ', new Set(), { signal: controller.signal })

    expect(mockSearchUsers).toHaveBeenCalledWith({
      q: 'ada',
      after: undefined,
      limit: 10,
      signal: controller.signal,
    })
  })

  it('filters out excluded ids from the results', async () => {
    mockSearchUsers.mockResolvedValueOnce(makePage(['u-1', 'u-2', 'u-3']))

    const result = await searchUsersExcluding('ada', new Set(['u-2']))

    expect(result.map(u => u.id)).toEqual(['u-1', 'u-3'])
  })

  it('follows page_info.end_cursor when exclusions consume an entire page', async () => {
    mockSearchUsers
      .mockResolvedValueOnce(makePage(['u-1'], { has_next_page: true, end_cursor: 'cursor-1' }))
      .mockResolvedValueOnce(makePage(['u-2']))

    const result = await searchUsersExcluding('ada', new Set(['u-1']), { minResults: 1 })

    expect(result.map(u => u.id)).toEqual(['u-2'])
    expect(mockSearchUsers).toHaveBeenCalledTimes(2)
    expect(mockSearchUsers).toHaveBeenNthCalledWith(1, {
      q: 'ada',
      after: undefined,
      limit: 10,
      signal: undefined,
    })
    expect(mockSearchUsers).toHaveBeenNthCalledWith(2, {
      q: 'ada',
      after: 'cursor-1',
      limit: 10,
      signal: undefined,
    })
  })

  it('stops once minResults matches have been found', async () => {
    mockSearchUsers.mockResolvedValueOnce(
      makePage(['u-1', 'u-2'], { has_next_page: true, end_cursor: 'cursor-1' }),
    )

    const result = await searchUsersExcluding('ada', new Set(), { minResults: 2 })

    expect(result.map(u => u.id)).toEqual(['u-1', 'u-2'])
    expect(mockSearchUsers).toHaveBeenCalledTimes(1)
  })

  it('stops when pagination is exhausted before minResults is reached', async () => {
    mockSearchUsers.mockResolvedValueOnce(makePage(['u-1'], { has_next_page: false }))

    const result = await searchUsersExcluding('ada', new Set(), { minResults: 10 })

    expect(result.map(u => u.id)).toEqual(['u-1'])
    expect(mockSearchUsers).toHaveBeenCalledTimes(1)
  })

  it('caps fan-out at the additional-page safety bound', async () => {
    mockSearchUsers.mockResolvedValue(
      makePage(['excluded'], { has_next_page: true, end_cursor: 'cursor-next' }),
    )

    const result = await searchUsersExcluding('ada', new Set(['excluded']), { minResults: 1 })

    expect(result).toEqual([])
    // Initial request + MAX_ADDITIONAL_PAGES (4) continuations = 5 total requests.
    expect(mockSearchUsers).toHaveBeenCalledTimes(5)
  })
})
