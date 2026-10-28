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
  applyReportAbusePenalty,
  getReportIntegrityPenaltyClient,
  getReportIntegrityFlagClient,
  resolveReportIntegrityFlag,
  revokeReportAbusePenalty,
} from '../report-integrity'

const mockGet = vi.mocked(clientApi.get)
const mockPatch = vi.mocked(clientApi.patch)
const mockPost = vi.mocked(clientApi.post)
const mockDelete = vi.mocked(clientApi.delete)

describe('report-integrity client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveReportIntegrityFlag', () => {
    it('PATCHes an encoded flag path with the selected resolution body', async () => {
      const response = { flag: { id: 'flag-1', resolved_at: '2024-01-01T00:00:00Z' } }
      mockPatch.mockResolvedValueOnce(response)

      const result = await resolveReportIntegrityFlag('flag ?#%/1', 'dismissed')

      expect(mockPatch).toHaveBeenCalledWith(
        '/api/v1/report-integrity/flags/flag%20%3F%23%25%2F1',
        {
          resolution: 'dismissed',
        },
      )
      expect(result).toBe(response)
    })
  })

  it('loads exact flags and penalties for reconciliation', async () => {
    mockGet.mockResolvedValue({})
    await getReportIntegrityFlagClient('flag ?#%/1')
    await getReportIntegrityPenaltyClient('penalty ?#%/1')
    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      '/api/v1/report-integrity/flags/flag%20%3F%23%25%2F1',
    )
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/api/v1/report-integrity/penalties/penalty%20%3F%23%25%2F1',
    )
  })

  describe('applyReportAbusePenalty', () => {
    it('POSTs to /api/v1/report-integrity/flags/:flagId/penalties', async () => {
      const response = { penalized_user_count: 3 }
      mockPost.mockResolvedValueOnce(response)

      const result = await applyReportAbusePenalty('flag ?#%/abc')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/report-integrity/flags/flag%20%3F%23%25%2Fabc/penalties',
      )
      expect(result).toBe(response)
    })
  })

  describe('revokeReportAbusePenalty', () => {
    it('DELETEs /api/v1/report-integrity/penalties/:penaltyId', async () => {
      const response = { revoked: true }
      mockDelete.mockResolvedValueOnce(response)

      const result = await revokeReportAbusePenalty('penalty ?#%/99')

      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/report-integrity/penalties/penalty%20%3F%23%25%2F99',
      )
      expect(result).toBe(response)
    })
  })
})
