import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientApi } from '@/lib/api/client/instance'
import { deleteMyRewardsProgramPointValuation, updateMyRewardsProgramPointValuation } from '../my'

type ClientApi = typeof import('@/lib/api/client/instance').clientApi

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<ClientApi['delete']>(),
        patch: vi.fn<ClientApi['patch']>(),
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

const mockedClientApi = vi.mocked(clientApi)

describe('point valuation client helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('encodes point valuation identifiers as one path segment', async () => {
    mockedClientApi.patch.mockResolvedValueOnce({ point_valuation: {} } as never)
    mockedClientApi.delete.mockResolvedValueOnce(undefined)

    await updateMyRewardsProgramPointValuation('valuation ?#%', { note: 'updated' })
    await deleteMyRewardsProgramPointValuation('valuation ?#%')

    expect(mockedClientApi.patch).toHaveBeenCalledWith(
      '/api/v1/my/rewards-program-point-valuations/valuation%20%3F%23%25',
      { note: 'updated' },
    )
    expect(mockedClientApi.delete).toHaveBeenCalledWith(
      '/api/v1/my/rewards-program-point-valuations/valuation%20%3F%23%25',
    )
  })

  it.each(['.', '..', String.raw`bad\segment`])(
    'rejects unsafe point valuation identifier %s',
    identifier => {
      expect(() => updateMyRewardsProgramPointValuation(identifier, {})).toThrow(
        'Invalid identifier',
      )
      expect(() => deleteMyRewardsProgramPointValuation(identifier)).toThrow('Invalid identifier')
      expect(mockedClientApi.patch).not.toHaveBeenCalled()
      expect(mockedClientApi.delete).not.toHaveBeenCalled()
    },
  )
})
