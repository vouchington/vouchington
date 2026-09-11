import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientApi } from '@/lib/api/client/instance'
import {
  getHouseholdMembershipsClient,
  getHouseholdsClient,
  removeHouseholdMembership,
} from '../households'

type ClientApi = typeof import('@/lib/api/client/instance').clientApi

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<ClientApi['delete']>(),
        get: vi.fn<ClientApi['get']>(),
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

const mockedClientApi = vi.mocked(clientApi)

describe('household client helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards typed household access and pagination parameters', async () => {
    mockedClientApi.get.mockResolvedValueOnce({ results: [] })
    await getHouseholdsClient({ access: 'member', after: 'next-household', limit: 25 })
    expect(mockedClientApi.get).toHaveBeenCalledWith('/api/v1/households', {
      searchParams: { access: 'member', after: 'next-household', limit: 25 },
    })
  })

  it('forwards membership pagination parameters', async () => {
    mockedClientApi.get.mockResolvedValueOnce({ results: [] })
    await getHouseholdMembershipsClient('household-1', { after: 'next-member', limit: 25 })
    expect(mockedClientApi.get).toHaveBeenCalledWith('/api/v1/households/household-1/memberships', {
      searchParams: { after: 'next-member', limit: 25 },
    })
  })
  it('encodes the household identifier as one membership-list path segment', async () => {
    mockedClientApi.get.mockResolvedValueOnce({ results: [] })

    await getHouseholdMembershipsClient('household ?#%')

    expect(mockedClientApi.get).toHaveBeenCalledWith(
      '/api/v1/households/household%20%3F%23%25/memberships',
      { searchParams: {} },
    )
  })

  it('encodes both identifiers as individual deletion path segments', async () => {
    mockedClientApi.delete.mockResolvedValueOnce(undefined)

    await removeHouseholdMembership('household ?#%', 'membership ?#%')

    expect(mockedClientApi.delete).toHaveBeenCalledWith(
      '/api/v1/households/household%20%3F%23%25/memberships/membership%20%3F%23%25',
    )
  })

  it.each(['.', '..', String.raw`bad\segment`])(
    'rejects unsafe identifier %s',
    async identifier => {
      expect(() => getHouseholdMembershipsClient(identifier)).toThrow('Invalid identifier')
      expect(() => removeHouseholdMembership('household', identifier)).toThrow('Invalid identifier')
    },
  )
})
