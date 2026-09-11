import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type {
  CommunityModerationReport,
  ModerationQueueClaim,
} from '@/types/api-responses/community-moderation'

const mockNav = createNavMock()

const { mockClaim, mockRelease, mockDiscuss, mockEscalate, mockDeEscalate } = vi.hoisted(() => ({
  mockClaim: vi.fn<VitestLooseMock>(),
  mockRelease: vi.fn<VitestLooseMock>(),
  mockDiscuss: vi.fn<VitestLooseMock>(),
  mockEscalate: vi.fn<VitestLooseMock>(),
  mockDeEscalate: vi.fn<VitestLooseMock>(),
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

import { ModQueueReports } from '../mod-queue-reports'

const onClaimToggle = vi.fn<() => void>()
const onEscalateToggle = vi.fn<() => void>()

const BASE_PROPS = {
  activeKey: null,
  bulkDisabled: false,
  communitySlug: 'test-community',
  loading: null,
  onResolve: vi.fn<() => void>(),
  onSelectionToggle: vi.fn<() => void>(),
  onClaimToggle,
  onEscalateToggle,
  selectedIds: new Set<string>(),
}

function makeClaim(overrides: Partial<ModerationQueueClaim> = {}): ModerationQueueClaim {
  return {
    id: 'claim-1',
    community_id: 'community-1',
    report_id: 'report-1',
    post_id: null,
    claimed_by_id: 'user-1',
    claimed_at: '2026-01-01T00:00:00.000Z',
    released_at: null,
    ...overrides,
  }
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

describe('ModQueueReports claim/escalate/discuss actions', () => {
  beforeEach(() => {
    mockClaim.mockReset()
    mockRelease.mockReset()
    mockDiscuss.mockReset()
    mockEscalate.mockReset()
    mockDeEscalate.mockReset()
    onClaimToggle.mockReset()
    onEscalateToggle.mockReset()
    mockClaim.mockResolvedValue({ claim: { id: 'claim-1' }, claimed_by_other: false })
    mockRelease.mockResolvedValue(undefined)
    mockDiscuss.mockResolvedValue({ conversation: { id: 'conv-1' } })
    mockEscalate.mockResolvedValue(undefined)
    mockDeEscalate.mockResolvedValue(undefined)
    mockNav.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders Claim button and calls claimCommunityModerationReport on click', async () => {
    render(
      <ModQueueReports
        {...BASE_PROPS}
        reports={[makeReport()]}
        currentUserId='user-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))

    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith('test-community', 'report-1'))
    expect(onClaimToggle).toHaveBeenCalledWith('report-1')
  })

  it('renders Release button when report is claimed by me and calls release on click', async () => {
    const report = makeReport({ claim: makeClaim({ claimed_by_id: 'user-1' }) })

    render(
      <ModQueueReports
        {...BASE_PROPS}
        reports={[report]}
        currentUserId='user-1'
      />,
    )

    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Release' }))

    await waitFor(() => expect(mockRelease).toHaveBeenCalledWith('test-community', 'report-1'))
    expect(onClaimToggle).toHaveBeenCalledWith('report-1')
  })

  it('shows claimed-by-other badge when report is claimed by another user', () => {
    const report = makeReport({ claim: makeClaim({ claimed_by_id: 'other-user' }) })

    render(
      <ModQueueReports
        {...BASE_PROPS}
        reports={[report]}
        currentUserId='user-1'
      />,
    )

    expect(screen.getByText('Claimed')).toBeInTheDocument()
  })

  it('opens the internal thread and navigates in the same tab on Discuss click', async () => {
    render(
      <ModQueueReports
        {...BASE_PROPS}
        reports={[makeReport()]}
        currentUserId='user-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await waitFor(() => expect(mockDiscuss).toHaveBeenCalledWith('test-community', 'report-1'))
    expect(mockNav.push).toHaveBeenCalledExactlyOnceWith('/messages/conv-1')
  })

  it('calls escalateCommunityModerationReport on Escalate click', async () => {
    render(
      <ModQueueReports
        {...BASE_PROPS}
        reports={[makeReport()]}
        currentUserId='user-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^escalate$/i }))

    await waitFor(() => expect(mockEscalate).toHaveBeenCalledWith('test-community', 'report-1'))
    expect(onEscalateToggle).toHaveBeenCalledWith('report-1', true)
  })

  it('shows escalated badge and Remove escalation button when report is escalated', async () => {
    const report = makeReport({ escalated_at: '2026-01-01T00:00:00.000Z' })

    render(
      <ModQueueReports
        {...BASE_PROPS}
        reports={[report]}
        currentUserId='user-1'
      />,
    )

    expect(screen.getByText('Escalated')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /remove escalation/i }))

    await waitFor(() => expect(mockDeEscalate).toHaveBeenCalledWith('test-community', 'report-1'))
    expect(onEscalateToggle).toHaveBeenCalledWith('report-1', false)
  })
})
