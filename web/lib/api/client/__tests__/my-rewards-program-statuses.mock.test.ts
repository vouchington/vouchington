import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientApi } from '@/lib/api/client/instance'
import { deleteMyRewardsProgramStatus, updateMyRewardsProgramStatus } from '../my'

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

describe('rewards program status client helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('encodes status identifiers as one path segment', async () => {
    mockedClientApi.patch.mockResolvedValueOnce({ rewards_program_status: {} } as never)
    mockedClientApi.delete.mockResolvedValueOnce(undefined)
    await updateMyRewardsProgramStatus('status ?#%', { since: '2026-01-01' })
    await deleteMyRewardsProgramStatus('status ?#%')
    expect(mockedClientApi.patch).toHaveBeenCalledWith(
      '/api/v1/my/rewards-program-statuses/status%20%3F%23%25',
      { since: '2026-01-01' },
    )
    expect(mockedClientApi.delete).toHaveBeenCalledWith(
      '/api/v1/my/rewards-program-statuses/status%20%3F%23%25',
    )
  })

  it.each(['.', '..', String.raw`bad\segment`])('rejects unsafe status identifier %s', id => {
    expect(() => updateMyRewardsProgramStatus(id, {})).toThrow('Invalid identifier')
    expect(() => deleteMyRewardsProgramStatus(id)).toThrow('Invalid identifier')
  })
})
