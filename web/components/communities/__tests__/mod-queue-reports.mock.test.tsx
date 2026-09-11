import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityModerationReport } from '@/types/api-responses'

const { mockOpenModmailThreadForReport, mockOnError, mockPush, mockConfirmCommunityBanEvasion } =
  vi.hoisted(() => ({
    mockOpenModmailThreadForReport: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
    mockPush: vi.fn<VitestLooseMock>(),
    mockConfirmCommunityBanEvasion: vi.fn<() => Promise<void>>(),
  }))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  openModmailThreadForReport: mockOpenModmailThreadForReport,
}))

vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: mockConfirmCommunityBanEvasion,
  dismissCommunityBanEvasion: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

import { ModQueueReports } from '../mod-queue-reports'

function makeReport(overrides?: Partial<CommunityModerationReport>): CommunityModerationReport {
  return {
    id: 'report-1',
    entity_type: 'post',
    entity_id: 'post-1',
    reason: 'spam',
    note: null,
    status: 'pending',
    target_label: 'Test Post',
    target_content: null,
    target_path: '/posts/post-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as CommunityModerationReport
}

describe('ModQueueReports', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders report cards with a Send Message button for site staff', () => {
    render(
      <ModQueueReports
        communitySlug='my-community'
        isStaff
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport()]}
        selectedIds={new Set()}
      />,
    )

    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('hides the Send Message button for non-staff', () => {
    render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport()]}
        selectedIds={new Set()}
      />,
    )

    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
  })

  it('calls openModmailThreadForReport and navigates to DM conversation on click', async () => {
    mockOpenModmailThreadForReport.mockResolvedValueOnce({ conversation: { id: 'conv-1' } })

    render(
      <ModQueueReports
        communitySlug='my-community'
        isStaff
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport()]}
        selectedIds={new Set()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(mockOpenModmailThreadForReport).toHaveBeenCalledWith('my-community', 'report-1')
      expect(mockPush).toHaveBeenCalledWith('/messages/conv-1')
    })
  })

  it('calls onError when openModmailThreadForReport fails', async () => {
    const err = new Error('network error')
    mockOpenModmailThreadForReport.mockRejectedValueOnce(err)

    render(
      <ModQueueReports
        communitySlug='my-community'
        isStaff
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport()]}
        selectedIds={new Set()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, {
        fallback: 'Failed to open modmail thread',
        tags: { action: 'send-modmail', communitySlug: 'my-community' },
      })
    })
  })

  it('disables the Send Message button while the request is in flight', async () => {
    let resolve!: (v: unknown) => void
    mockOpenModmailThreadForReport.mockReturnValueOnce(new Promise(r => (resolve = r)))

    render(
      <ModQueueReports
        communitySlug='my-community'
        isStaff
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport()]}
        selectedIds={new Set()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()

    resolve({ thread: { id: 'thread-1' } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled(),
    )
  })

  it('renders ban-evasion report note for site staff', () => {
    const banEvasionReport = makeReport({
      entity_type: 'user',
      entity_id: 'user-suspect',
      note: 'Suspected ban evasion: matches @banned-user',
      community_ban_evasion: {
        community_id: 'community-1',
        community_slug: 'test-community',
        source_user_id: 'source-user-1',
        source_username: 'banned-user',
        score: 0.82,
        flagged_at: '2026-01-01T00:00:00Z',
      },
    })

    const { container } = render(
      <ModQueueReports
        communitySlug='my-community'
        isStaff
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[banEvasionReport]}
        selectedIds={new Set()}
      />,
    )

    expect(container.querySelector('[data-pw="community-ban-evasion-badge"]')).not.toBeNull()
    expect(screen.getByText('Suspected ban evasion: matches @banned-user')).toBeInTheDocument()
  })

  it('does not render report notes for non-staff viewers', () => {
    render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport({ note: 'Reporter identity hint.' })]}
        selectedIds={new Set()}
      />,
    )

    expect(screen.queryByText('Reporter identity hint.')).not.toBeInTheDocument()
  })

  it('calls onBanEvasionAction when ban-evasion confirm is clicked', async () => {
    const onBanEvasionAction = vi.fn<VitestLooseMock>()
    const banEvasionReport = makeReport({
      entity_type: 'user',
      entity_id: 'user-suspect',
      community_ban_evasion: {
        community_id: 'community-1',
        community_slug: 'test-community',
        source_user_id: 'source-user-1',
        source_username: 'banned-user',
        score: 0.82,
        flagged_at: '2026-01-01T00:00:00Z',
      },
    })

    const { container } = render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onBanEvasionAction={onBanEvasionAction}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[banEvasionReport]}
        selectedIds={new Set()}
      />,
    )

    mockConfirmCommunityBanEvasion.mockResolvedValueOnce(undefined)
    fireEvent.click(container.querySelector('[data-pw="community-ban-evasion-confirm"]')!)
    await waitFor(() => expect(onBanEvasionAction).toHaveBeenCalledWith(banEvasionReport.id))
  })

  it('calls onResolve with reviewed when Reviewed button is clicked', () => {
    const onResolve = vi.fn<VitestLooseMock>()
    const report = makeReport()
    render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={onResolve}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[report]}
        selectedIds={new Set()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /reviewed/i }))
    expect(onResolve).toHaveBeenCalledWith(report, 'reviewed')
  })

  it('calls onResolve with dismissed when Dismiss button is clicked', () => {
    const onResolve = vi.fn<VitestLooseMock>()
    const report = makeReport()
    render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={onResolve}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[report]}
        selectedIds={new Set()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onResolve).toHaveBeenCalledWith(report, 'dismissed')
  })

  it('renders warn button when target_user_id is present', () => {
    const { container } = render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[makeReport({ target_user_id: 'user-1' })]}
        selectedIds={new Set()}
      />,
    )
    expect(container.querySelector('[data-pw="mod-queue-warn-button"]')).not.toBeNull()
  })
})
