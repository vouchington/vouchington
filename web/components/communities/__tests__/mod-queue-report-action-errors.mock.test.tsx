import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type {
  CommunityModerationReport,
  ModerationQueueClaim,
} from '@/types/api-responses/community-moderation'

const mockNav = createNavMock()

const { mockClaim, mockRelease, mockDiscuss, mockEscalate, mockDeEscalate, mockOnError } =
  vi.hoisted(() => ({
    mockClaim: vi.fn<VitestLooseMock>(),
    mockRelease: vi.fn<VitestLooseMock>(),
    mockDiscuss: vi.fn<VitestLooseMock>(),
    mockEscalate: vi.fn<VitestLooseMock>(),
    mockDeEscalate: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
  }))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client/mod-queue-actions'), () => ({
  claimCommunityModerationReport: mockClaim,
  releaseCommunityModerationReport: mockRelease,
  openModInternalThreadForReport: mockDiscuss,
  escalateCommunityModerationReport: mockEscalate,
  deEscalateCommunityModerationReport: mockDeEscalate,
}))
vi.mock(import('@/lib/api/client/modmail'), () => ({
  openModmailThreadForReport: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

import { ModQueueReports } from '../mod-queue-reports'

const onClaimToggle = vi.fn<(reportId: string) => void>()
const onEscalateToggle = vi.fn<(reportId: string, escalated: boolean) => void>()
const BASE_PROPS = {
  communitySlug: 'test-community',
  loading: null,
  onResolve: vi.fn<(report: CommunityModerationReport, status: 'reviewed' | 'dismissed') => void>(),
  onSelectionToggle: vi.fn<(reportId: string) => void>(),
  onClaimToggle,
  onEscalateToggle,
  selectedIds: new Set<string>(),
}

function makeReport(overrides: Partial<CommunityModerationReport> = {}): CommunityModerationReport {
  return {
    id: 'report-1',
    created_at: '2026-01-01T00:00:00.000Z',
    reviewed_at: null,
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: null,
    target_label: 'Test post',
    target_path: '/post/test-post',
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}

function makeClaim(): ModerationQueueClaim {
  return {
    id: 'claim-1',
    community_id: 'community-1',
    report_id: 'report-1',
    post_id: null,
    claimed_by_id: 'user-1',
    claimed_at: '2026-01-01T00:00:00.000Z',
    released_at: null,
  }
}

describe('ModQueueReports action errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    [
      'mod-internal-thread',
      mockDiscuss,
      /discuss/i,
      {},
      'Failed to open internal discussion thread',
    ],
    ['claim-report', mockClaim, /^claim$/i, {}, 'Failed to claim report'],
    [
      'release-report',
      mockRelease,
      /^release$/i,
      { claim: makeClaim() },
      'Failed to release report claim',
    ],
    ['escalate-report', mockEscalate, /^escalate$/i, {}, 'Failed to escalate report'],
    [
      'de-escalate-report',
      mockDeEscalate,
      /remove escalation/i,
      { escalated_at: '2026-01-01T00:00:00.000Z' },
      'Failed to remove escalation',
    ],
  ])(
    'reports a rejected action and restores %s',
    async (action, apiMock, buttonName, overrides, fallback) => {
      let rejectRequest: (reason?: unknown) => void = () => {}
      apiMock.mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectRequest = reject
          }),
      )
      const error = new Error(`${action} failed`)

      render(
        <ModQueueReports
          {...BASE_PROPS}
          reports={[makeReport(overrides)]}
          currentUserId='user-1'
        />,
      )
      const button = screen.getByRole('button', { name: buttonName })
      fireEvent.click(button)
      await waitFor(() => expect(button).toBeDisabled())

      act(() => rejectRequest(error))

      await waitFor(() => expect(button).toBeEnabled())
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback,
        tags: { action, communitySlug: 'test-community' },
      })
      expect(onClaimToggle).not.toHaveBeenCalled()
      expect(onEscalateToggle).not.toHaveBeenCalled()
      expect(mockNav.refresh).not.toHaveBeenCalled()
      expect(mockNav.push).not.toHaveBeenCalled()
    },
  )
})
