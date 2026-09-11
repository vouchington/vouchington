import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serverApi } from './instance'
import { getHouseholdMemberships, getHouseholds } from './households'

type ServerApi = typeof import('./instance').serverApi

vi.mock(
  import('./instance'),
  () =>
    ({ serverApi: { get: vi.fn<ServerApi['get']>() } }) as unknown as typeof import('./instance'),
)

describe('household server helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards access, cursor, limit, and headers without shape drift', async () => {
    vi.mocked(serverApi.get).mockResolvedValueOnce({ results: [] })
    await getHouseholds({
      access: 'owned',
      after: 'next-household',
      limit: 1,
      headers: { cookie: 'session=one' },
    })
    expect(serverApi.get).toHaveBeenCalledWith('/api/v1/households', {
      headers: { cookie: 'session=one' },
      searchParams: { access: 'owned', after: 'next-household', limit: 1 },
    })
  })

  it('forwards membership cursor and limit independently', async () => {
    vi.mocked(serverApi.get).mockResolvedValueOnce({ results: [] })
    await getHouseholdMemberships('household-1', { after: 'next-member', limit: 25 })
    expect(serverApi.get).toHaveBeenCalledWith('/api/v1/households/household-1/memberships', {
      headers: undefined,
      searchParams: { after: 'next-member', limit: 25 },
    })
  })
})
