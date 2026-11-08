import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { CommunityModerationReportsResponseBody } from '@/types/api-responses/community-moderation'
import {
  getCommunityPendingModerationReportsClient,
  resolveCommunityModerationReport,
  resolveModerationReport,
  rerunReportJudgement,
  getReportJudgementRun,
  submitReport,
} from '../reports'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockPatch = vi.mocked(clientApi.patch)

describe('reports client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs report submissions to the reports endpoint', async () => {
    const response = {
      report: {
        id: 'report-1',
        status: 'pending',
        entity_type: 'post',
        entity_id: 'post-1',
      },
      isDuplicate: false,
    }
    mockPost.mockResolvedValueOnce(response)

    const result = await submitReport({
      entityType: 'post',
      entityId: 'post-1',
      reason: 'spam',
      note: 'context',
    })

    expect(mockPost).toHaveBeenCalledWith('/api/v1/reports', {
      entityType: 'post',
      entityId: 'post-1',
      reason: 'spam',
      note: 'context',
    })
    expect(result).toBe(response)
  })

  it('POSTs to the judgements endpoint to re-run the AI judgement', async () => {
    const response = { queued: true, rerun_by_id: 'admin-1', run_id: 'report_judgement_opaque' }
    mockPost.mockResolvedValueOnce(response)

    const result = await rerunReportJudgement('report-1')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/reports/report-1/judgements')
    expect(result).toBe(response)
  })

  it('GETs the exact judgement run result', async () => {
    const response = { completed: false, judgement_id: null }
    mockGet.mockResolvedValueOnce(response)

    const result = await getReportJudgementRun('report-1', 'report_judgement_opaque-id')

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/reports/report-1/judgements/report_judgement_opaque-id',
    )
    expect(result).toBe(response)
  })

  it('PATCHes admin report resolutions to the report endpoint', async () => {
    const response = { report: { id: 'report-1', status: 'reviewed' } }
    mockPatch.mockResolvedValueOnce(response)

    const result = await resolveModerationReport('report-1', 'reviewed')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/reports/report-1', { status: 'reviewed' })
    expect(result).toBe(response)
  })

  it('requests the community pending report page with encoded identifier and options', async () => {
    const response: CommunityModerationReportsResponseBody = { reports: [] }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () =>
        getCommunityPendingModerationReportsClient('credit cards', { after: 'cursor', limit: 20 }),
      expectedArgs: [
        '/api/v1/communities/credit%20cards/reports/pending',
        { searchParams: { after: 'cursor', limit: 20 } },
      ],
    })
  })

  it('PATCHes community report resolutions to the community report endpoint', async () => {
    await resolveCommunityModerationReport('credit-cards', 'report-1', 'dismissed')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/communities/credit-cards/reports/report-1', {
      status: 'dismissed',
    })
  })
})
