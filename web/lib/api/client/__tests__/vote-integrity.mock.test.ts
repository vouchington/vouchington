import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  applyVoteRingPenalty,
  getVoteIntegrityFlagClient,
  getVoteIntegrityFlagsClient,
  getVoteIntegrityPenaltiesClient,
  getVoteIntegrityPenaltyClient,
  resolveVoteIntegrityFlag,
  revokeVoteWeightPenalty,
} from '../vote-integrity'

const mockGet = vi.mocked(clientApi.get)
const mockPatch = vi.mocked(clientApi.patch)
const mockPost = vi.mocked(clientApi.post)
const mockDelete = vi.mocked(clientApi.delete)

describe('vote-integrity client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards vote flag status and cursor query values to the API client', async () => {
    mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

    await getVoteIntegrityFlagsClient({ status: 'resolved', after: 'cursor ?#%' })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/vote-integrity/flags', {
      searchParams: { status: 'resolved', after: 'cursor ?#%' },
    })
  })

  it('uses an empty vote flag query when no filters are selected', async () => {
    mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

    await getVoteIntegrityFlagsClient()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/vote-integrity/flags', { searchParams: {} })
  })

  it('keeps the mandatory flag source when optional penalty filters are absent', async () => {
    mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

    await getVoteIntegrityPenaltiesClient()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/vote-integrity/penalties', {
      searchParams: { source: 'flag' },
    })
  })

  it('always scopes the web penalty ledger to flag-sourced penalties', async () => {
    mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

    await getVoteIntegrityPenaltiesClient({ status: 'active', after: 'cursor-2' })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/vote-integrity/penalties', {
      searchParams: { source: 'flag', status: 'active', after: 'cursor-2' },
    })
  })

  it('loads exact flags and penalties for reconciliation', async () => {
    mockGet.mockResolvedValue({})
    await getVoteIntegrityFlagClient('flag ?#%/1')
    await getVoteIntegrityPenaltyClient('penalty ?#%/1')
    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/v1/vote-integrity/flags/flag%20%3F%23%25%2F1')
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/api/v1/vote-integrity/penalties/penalty%20%3F%23%25%2F1',
    )
  })

  it('scopes vote penalty reconciliation to one flag across all statuses', async () => {
    mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

    await getVoteIntegrityPenaltiesClient({ sourceFlagId: 'flag-1' })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/vote-integrity/penalties', {
      searchParams: { source: 'flag', source_flag_id: 'flag-1' },
    })
  })

  it('encodes resolution, penalty application, and revocation paths', async () => {
    mockPatch.mockResolvedValueOnce({ flag: {} })
    mockPost.mockResolvedValueOnce({ penalized_user_count: 1 })
    mockDelete.mockResolvedValueOnce({ penalty: {} })

    await resolveVoteIntegrityFlag('flag ?#%/1', 'suspended')
    await applyVoteRingPenalty('flag ?#%/1')
    await revokeVoteWeightPenalty('penalty ?#%/1')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/vote-integrity/flags/flag%20%3F%23%25%2F1', {
      resolution: 'suspended',
    })
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/vote-integrity/flags/flag%20%3F%23%25%2F1/penalties',
    )
    expect(mockDelete).toHaveBeenCalledWith(
      '/api/v1/vote-integrity/penalties/penalty%20%3F%23%25%2F1',
    )
  })
})
