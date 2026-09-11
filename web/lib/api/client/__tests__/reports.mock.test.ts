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
import {
  getModerationReports,
  resolveCommunityModerationReport,
  resolveModerationReport,
  rerunReportJudgement,
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
    const response = { queued: true, rerun_by_id: 'admin-1' }
    mockPost.mockResolvedValueOnce(response)

    const result = await rerunReportJudgement('report-1')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/reports/report-1/judgements')
    expect(result).toBe(response)
  })

  it('PATCHes admin report resolutions to the report endpoint', async () => {
    const response = { report: { id: 'report-1', status: 'reviewed' } }
    mockPatch.mockResolvedValueOnce(response)

    const result = await resolveModerationReport('report-1', 'reviewed')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/reports/report-1', { status: 'reviewed' })
    expect(result).toBe(response)
  })

  it('PATCHes community report resolutions to the community report endpoint', async () => {
    await resolveCommunityModerationReport('credit-cards', 'report-1', 'dismissed')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/communities/credit-cards/reports/report-1', {
      status: 'dismissed',
    })
  })

  describe('getModerationReports', () => {
    it('GETs /api/v1/reports with no query string when no params provided', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      await getModerationReports()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/reports')
    })

    it('GETs /api/v1/reports with status query param', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      await getModerationReports({ status: 'pending' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/reports?status=pending')
    })

    it('GETs /api/v1/reports with sort query param', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      await getModerationReports({ sort: 'most_reported' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/reports?sort=most_reported')
    })

    it('GETs /api/v1/reports with after and limit query params', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      await getModerationReports({ after: 'abc123', limit: 20 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/reports?after=abc123&limit=20')
    })

    it('GETs /api/v1/reports with all params combined', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      await getModerationReports({
        status: 'reviewed',
        sort: 'created_at_desc',
        after: 'xyz',
        limit: 10,
      })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/reports?status=reviewed&sort=created_at_desc&after=xyz&limit=10',
      )
    })

    it('GETs /api/v1/reports with cluster query param', async () => {
      mockGet.mockResolvedValueOnce({
        cluster_mode: 'entity',
        results: [],
        duplicate_clusters: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      await getModerationReports({ cluster: 'entity' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/reports?cluster=entity')
    })
  })
})
