import { render } from '@testing-library/react'
import { describe, expect, vi } from 'vitest'
import {
  registerModQueueActionErrorTests,
  type ModQueueActionErrorCase,
  type ModQueueRejectedAction,
} from '@/test-helpers/components/communities/mod-queue-action-errors'
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

const reportActionErrorCases: readonly ModQueueActionErrorCase<CommunityModerationReport>[] = [
  {
    action: 'mod-internal-thread',
    apiMock: mockDiscuss,
    buttonName: /discuss/i,
    item: makeReport({}),
    fallback: 'Failed to open internal discussion thread',
  },
  {
    action: 'claim-report',
    apiMock: mockClaim,
    buttonName: /^claim$/i,
    item: makeReport({}),
    fallback: 'Failed to claim report',
  },
  {
    action: 'release-report',
    apiMock: mockRelease,
    buttonName: /^release$/i,
    item: makeReport({ claim: makeClaim() }),
    fallback: 'Failed to release report claim',
  },
  {
    action: 'escalate-report',
    apiMock: mockEscalate,
    buttonName: /^escalate$/i,
    item: makeReport({}),
    fallback: 'Failed to escalate report',
  },
  {
    action: 'de-escalate-report',
    apiMock: mockDeEscalate,
    buttonName: /remove escalation/i,
    item: makeReport({ escalated_at: '2026-01-01T00:00:00.000Z' }),
    fallback: 'Failed to remove escalation',
  },
]

function assertRejectedReportAction({ action, error, fallback }: ModQueueRejectedAction): void {
  expect(mockOnError).toHaveBeenCalledWith(error, {
    fallback,
    tags: { action, communitySlug: 'test-community' },
  })
  expect(onClaimToggle).not.toHaveBeenCalled()
  expect(onEscalateToggle).not.toHaveBeenCalled()
  expect(mockNav.refresh).not.toHaveBeenCalled()
  expect(mockNav.push).not.toHaveBeenCalled()
}

describe('ModQueueReports action errors', () => {
  registerModQueueActionErrorTests({
    reset: () => {
      mockNav.reset()
    },
    cases: reportActionErrorCases,
    renderItem: report => {
      render(
        <ModQueueReports
          {...BASE_PROPS}
          reports={[report]}
          currentUserId='user-1'
        />,
      )
    },
    assertRejected: assertRejectedReportAction,
  })
})
