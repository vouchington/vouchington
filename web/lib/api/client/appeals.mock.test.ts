import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getModerationAppealClient,
  listModerationAppealsClient,
  createModerationAppeal,
  updateAppealDraft,
  approveAppeal,
  sendAppealResolution,
  resolveAppeal,
  enqueueAppealAIDraftRerun,
  reconcileAppealAIDraft,
  AppealDraftReconciliationTimeoutError,
} from './appeals'
import { makeAppeal } from '@/components/appeals/fixtures/appeals-client-fixtures'

const { mockGet, mockPost, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
  mockPatch: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        post: mockPost,
        patch: mockPatch,
      },
    }) as unknown as typeof import('./instance'),
)

describe('appeals client api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPatch.mockReset()
    mockPost.mockResolvedValue({ appeal: { id: 'appeal-1' } })
    mockPatch.mockResolvedValue({ appeal: { id: 'appeal-1' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('listModerationAppealsClient', () => {
    it('forwards the continuation cursor and filters', async () => {
      const page = {
        appeals: [],
        page_info: { has_next_page: false, end_cursor: null },
      }
      mockGet.mockResolvedValueOnce(page)

      const result = await listModerationAppealsClient({
        after: 'cursor-1',
        status: 'pending',
        mine: true,
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals', {
        searchParams: { limit: 50, after: 'cursor-1', status: 'pending', mine: true },
      })
      expect(result).toBe(page)
    })
  })

  describe('createModerationAppeal', () => {
    it('calls POST /api/v1/appeals with data', async () => {
      const data = { target_type: 'ban' as const, target_id: 'ban-1', appeal_reason: 'unfair' }
      await createModerationAppeal(data)
      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals', data)
    })
  })

  describe('updateAppealDraft', () => {
    it('calls PATCH /api/v1/appeals/:id with data', async () => {
      await updateAppealDraft('appeal-1', { public_response: 'response text' })
      expect(mockPatch).toHaveBeenCalledWith('/api/v1/appeals/appeal-1', {
        public_response: 'response text',
      })
    })
  })

  describe('approveAppeal', () => {
    it('calls POST /api/v1/appeals/:id/approval', async () => {
      await approveAppeal('appeal-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/approval', {})
    })
  })

  describe('sendAppealResolution', () => {
    it('calls POST /api/v1/appeals/:id/delivery', async () => {
      await sendAppealResolution('appeal-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/delivery', {})
    })
  })

  describe('resolveAppeal', () => {
    it('calls POST /api/v1/appeals/:id/resolution with action accept', async () => {
      await resolveAppeal('appeal-1', 'accept')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/resolution', {
        action: 'accept',
      })
    })

    it('calls POST /api/v1/appeals/:id/resolution with action reduce', async () => {
      await resolveAppeal('appeal-1', 'reduce')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/resolution', {
        action: 'reduce',
      })
    })

    it('calls POST /api/v1/appeals/:id/resolution with action deny', async () => {
      await resolveAppeal('appeal-1', 'deny')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/resolution', {
        action: 'deny',
      })
    })
  })

  describe('AI draft rerun client helpers', () => {
    it('reconciles a previously queued draft without another enqueue', async () => {
      const before = makeAppeal({
        ai_drafted_at: '2026-01-01T00:00:00.000Z',
        latest_lifecycle_change_id: 'change-1',
        ai_draft_requested_run_id: 'appeal_resolution_request-1',
        ai_draft_run_id: null,
      })
      const refreshed = makeAppeal({
        ai_drafted_at: '2026-01-01T00:01:00.000Z',
        latest_lifecycle_change_id: 'change-2',
        ai_draft_requested_run_id: 'appeal_resolution_request-1',
        ai_draft_run_id: 'appeal_resolution_request-1',
      })
      mockGet.mockResolvedValueOnce({ appeal: refreshed })

      await expect(reconcileAppealAIDraft(before)).resolves.toEqual({ appeal: refreshed })

      expect(mockPost).not.toHaveBeenCalled()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals/appeal-1', {
        searchParams: { consistency: 'primary' },
      })
    })

    it('exposes enqueue separately from reconciliation', async () => {
      const admission = {
        queued: true as const,
        rerun_by_id: 'staff-1',
        run_id: 'appeal_resolution_00000000-0000-7000-8000-000000000101',
      }
      mockPost.mockResolvedValueOnce(admission)

      await expect(enqueueAppealAIDraftRerun('appeal-1')).resolves.toEqual(admission)

      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/resolution-drafts', {})
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('reads the authoritative appeal after queuing and returns only a changed draft lifecycle', async () => {
      const before = makeAppeal({
        ai_drafted_at: '2026-01-01T00:00:00.000Z',
        latest_lifecycle_change_id: 'change-1',
        ai_draft_requested_run_id: 'appeal_resolution_request-1',
        ai_draft_run_id: null,
      })
      const refreshed = makeAppeal({
        ai_drafted_at: '2026-01-01T00:01:00.000Z',
        latest_lifecycle_change_id: 'change-2',
        ai_draft_requested_run_id: 'appeal_resolution_request-1',
        ai_draft_run_id: 'appeal_resolution_request-1',
      })
      mockPost.mockResolvedValueOnce({
        queued: true,
        rerun_by_id: 'staff-1',
        run_id: 'appeal_resolution_request-1',
      })
      mockGet.mockResolvedValueOnce({ appeal: refreshed })

      await enqueueAppealAIDraftRerun(before.id)
      await expect(reconcileAppealAIDraft(before)).resolves.toEqual({ appeal: refreshed })

      expect(mockPost).toHaveBeenCalledWith('/api/v1/appeals/appeal-1/resolution-drafts', {})
      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals/appeal-1', {
        searchParams: { consistency: 'primary' },
      })
    })

    it('keeps polling until the authoritative lifecycle revision changes', async () => {
      vi.useFakeTimers()
      const before = makeAppeal({
        ai_drafted_at: '2026-01-01T00:00:00.000Z',
        latest_lifecycle_change_id: 'change-1',
        ai_draft_requested_run_id: 'appeal_resolution_current',
        ai_draft_run_id: null,
      })
      const refreshed = makeAppeal({
        ai_drafted_at: '2025-12-31T00:00:00.000Z',
        latest_lifecycle_change_id: 'change-1',
        ai_draft_requested_run_id: 'appeal_resolution_current',
        ai_draft_run_id: 'appeal_resolution_current',
      })
      mockGet.mockResolvedValueOnce({ appeal: before }).mockResolvedValueOnce({ appeal: refreshed })

      const result = reconcileAppealAIDraft(before)
      await vi.advanceTimersByTimeAsync(3000)

      await expect(result).resolves.toEqual({ appeal: refreshed })
      expect(mockGet).toHaveBeenCalledTimes(2)
    })

    it('keeps the existing bounded deadline while a newer request supersedes this rerun', async () => {
      vi.useFakeTimers()
      const before = makeAppeal({
        ai_drafted_at: '2026-01-01T00:00:00.000Z',
        latest_lifecycle_change_id: 'change-1',
        ai_draft_requested_run_id: 'appeal_resolution_request-1',
        ai_draft_run_id: null,
      })
      mockGet.mockResolvedValue({
        appeal: makeAppeal({
          ai_draft_requested_run_id: 'appeal_resolution_request-2',
          ai_draft_run_id: 'appeal_resolution_request-1',
        }),
      })

      const capturedError = reconcileAppealAIDraft(before).catch((err: unknown) => err)
      await vi.advanceTimersByTimeAsync(57_000)

      await expect(capturedError).resolves.toBeInstanceOf(AppealDraftReconciliationTimeoutError)
      expect(mockGet).toHaveBeenCalledTimes(20)
    })

    it('does not treat an earlier saved run as completion after a newer request supersedes it', async () => {
      const before = makeAppeal({
        ai_draft_requested_run_id: 'appeal_resolution_request-1',
        ai_draft_run_id: null,
      })
      const earlier = makeAppeal({
        ai_draft_requested_run_id: 'appeal_resolution_request-2',
        ai_draft_run_id: 'appeal_resolution_request-1',
      })
      vi.useFakeTimers()
      mockGet.mockResolvedValueOnce({ appeal: earlier }).mockResolvedValueOnce({
        appeal: makeAppeal({
          ai_draft_requested_run_id: 'appeal_resolution_request-2',
          ai_draft_run_id: 'appeal_resolution_request-2',
        }),
      })

      const result = reconcileAppealAIDraft(before)
      await vi.advanceTimersByTimeAsync(3000)

      await expect(result).resolves.toMatchObject({
        appeal: { ai_draft_run_id: 'appeal_resolution_request-2' },
      })
      expect(mockGet).toHaveBeenCalledTimes(2)
    })

    it.each([
      ['approval', { approved_at: '2026-01-02T00:00:00Z' }],
      ['delivery', { sent_at: '2026-01-03T00:00:00Z' }],
      ['resolution', { status: 'resolved' as const, resolved_at: '2026-01-04T00:00:00Z' }],
    ])(
      'applies authoritative terminal %s while the current AI request is pending',
      async (_name, terminal) => {
        const before = makeAppeal({ ai_draft_requested_run_id: 'appeal_resolution_request-1' })
        const approved = makeAppeal({
          ...terminal,
          ai_draft_requested_run_id: 'appeal_resolution_request-2',
          ai_draft_run_id: null,
        })
        mockGet.mockResolvedValueOnce({ appeal: approved })

        await expect(reconcileAppealAIDraft(before)).resolves.toEqual({ appeal: approved })
        expect(mockGet).toHaveBeenCalledTimes(1)
      },
    )

    it('exposes the single-appeal read through the client boundary', async () => {
      const appeal = makeAppeal()
      mockGet.mockResolvedValueOnce({ appeal })

      await expect(getModerationAppealClient('appeal-1')).resolves.toEqual(appeal)

      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals/appeal-1')
    })
  })
})
