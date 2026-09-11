import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminModerationReport } from '../reports-client'
import { ReportDetail } from '../report-cluster-detail'

const { mockConfirmBanEvasion, mockDismissBanEvasion, mockOnError } = vi.hoisted(() => ({
  mockConfirmBanEvasion: vi.fn<VitestLooseMock>(),
  mockDismissBanEvasion: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: mockConfirmBanEvasion,
  dismissCommunityBanEvasion: mockDismissBanEvasion,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(import('@/components/moderation/user-mod-notes-cell'), () => ({
  UserModNotesControl: () => null,
}))

vi.mock(
  import('../report-row-warn-button'),
  () =>
    ({
      ReportRowWarnButton: () => <button type='button'>Warn</button>,
    }) as unknown as typeof import('../report-row-warn-button'),
)

describe('ReportDetail judgement freshness', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows Warn for an ordinary pending report', () => {
    renderDetail(makeReport({ target_user_id: 'target-user' }))

    expect(screen.getByRole('button', { name: 'Warn' })).toBeVisible()
  })

  it('hides Warn for a system-generated report with missing context', () => {
    renderDetail(
      makeReport({
        target_user_id: 'target-user',
        is_system_generated: true,
        community_ban_evasion: null,
      }),
    )

    expect(screen.queryByRole('button', { name: 'Warn' })).not.toBeInTheDocument()
  })

  it('shows an outdated badge for stale clustered report judgements', () => {
    render(
      <ReportDetail
        report={makeReport({
          judgement: {
            recommended_action: 'warn',
            public_response: 'Public warning.',
            internal_response: 'Needs review.',
            is_stale: true,
            judged_report_count: 1,
            current_report_count: 2,
          },
        })}
        disabled={false}
        rerunning={false}
        onRerun={vi.fn<() => void>()}
        onWarn={vi.fn<() => void>()}
      />,
    )

    expect(screen.getByText('Outdated')).toBeVisible()
  })

  it('renders actionable ban-evasion controls only for pending system reports with context', () => {
    const report = makeBanEvasionReport()
    const { rerender } = renderDetail(report)

    expect(screen.getByRole('button', { name: /confirm ban evasion/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /dismiss ban-evasion flag/i })).toBeVisible()

    rerender(
      <ReportDetail
        report={{ ...report, status: 'reviewed' }}
        disabled={false}
        rerunning={false}
        onRerun={vi.fn<() => void>()}
        onWarn={vi.fn<() => void>()}
      />,
    )
    expect(screen.queryByRole('button', { name: /confirm ban evasion/i })).not.toBeInTheDocument()
  })

  it('confirms and dismisses clustered ban-evasion reports with exact target arguments', async () => {
    mockConfirmBanEvasion.mockResolvedValue(undefined)
    mockDismissBanEvasion.mockResolvedValue(undefined)
    const handleBanEvasionAction = vi.fn<(reportId: string) => void>()
    const { rerender } = renderDetail(makeBanEvasionReport(), {
      onBanEvasionAction: handleBanEvasionAction,
    })

    fireEvent.click(screen.getByRole('button', { name: /confirm ban evasion/i }))
    await vi.waitFor(() =>
      expect(mockConfirmBanEvasion).toHaveBeenCalledWith('community-1', 'suspect-1'),
    )
    expect(handleBanEvasionAction).toHaveBeenCalledWith('report-1')

    rerender(
      <ReportDetail
        report={makeBanEvasionReport()}
        disabled={false}
        rerunning={false}
        onRerun={vi.fn<() => void>()}
        onWarn={vi.fn<() => void>()}
        onBanEvasionAction={handleBanEvasionAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss ban-evasion flag/i }))
    await vi.waitFor(() =>
      expect(mockDismissBanEvasion).toHaveBeenCalledWith('community-1', 'suspect-1'),
    )
    expect(handleBanEvasionAction).toHaveBeenCalledTimes(2)
  })

  it('disables both clustered ban-evasion actions while an action is pending', async () => {
    let resolveConfirm: (() => void) | undefined
    mockConfirmBanEvasion.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveConfirm = resolve
        }),
    )
    renderDetail(makeBanEvasionReport())

    const confirm = screen.getByRole('button', { name: /confirm ban evasion/i })
    const dismiss = screen.getByRole('button', { name: /dismiss ban-evasion flag/i })
    fireEvent.click(confirm)

    await vi.waitFor(() => expect(confirm).toBeDisabled())
    expect(dismiss).toBeDisabled()
    fireEvent.click(confirm)
    expect(mockConfirmBanEvasion).toHaveBeenCalledTimes(1)

    resolveConfirm?.()
    await vi.waitFor(() => expect(confirm).toBeEnabled())
  })

  it('disables clustered ban-evasion actions when the queue is disabled', () => {
    renderDetail(makeBanEvasionReport(), { disabled: true })

    expect(screen.getByRole('button', { name: /confirm ban evasion/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dismiss ban-evasion flag/i })).toBeDisabled()
  })

  it('reports clustered ban-evasion failures and leaves the actions available', async () => {
    const error = new Error('confirm failed')
    mockConfirmBanEvasion.mockRejectedValueOnce(error)
    renderDetail(makeBanEvasionReport())

    const confirm = screen.getByRole('button', { name: /confirm ban evasion/i })
    fireEvent.click(confirm)

    await vi.waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback: 'Failed to confirm ban evasion',
      }),
    )
    expect(confirm).toBeEnabled()
    expect(screen.getByRole('button', { name: /dismiss ban-evasion flag/i })).toBeEnabled()
  })
})

function renderDetail(
  report: AdminModerationReport,
  options: { disabled?: boolean; onBanEvasionAction?: (reportId: string) => void } = {},
) {
  const handleBanEvasionAction = options.onBanEvasionAction
  return render(
    <ReportDetail
      report={report}
      disabled={options.disabled ?? false}
      rerunning={false}
      onRerun={vi.fn<() => void>()}
      onWarn={vi.fn<() => void>()}
      onBanEvasionAction={handleBanEvasionAction}
    />,
  )
}

function makeBanEvasionReport(): AdminModerationReport {
  return makeReport({
    entity_type: 'user',
    entity_id: 'suspect-1',
    target_label: 'Suspect',
    target_user_id: 'suspect-1',
    is_system_generated: true,
    community_ban_evasion: {
      community_id: 'community-1',
      community_slug: 'community',
      source_user_id: 'source-1',
      source_username: 'source',
      score: 0.91,
      flagged_at: '2026-05-31T00:00:00.000Z',
    },
  })
}

function makeReport(overrides: Partial<AdminModerationReport> = {}): AdminModerationReport {
  return {
    id: 'report-1',
    case_id: 'case-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    reporter_user_id: 'user-1',
    reporter_username: 'reader',
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: '/discussion/reported-post',
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    target_user_id: null,
    target_available: true,
    target_is_restricted: false,
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    is_system_generated: false,
    judgement: null,
    post_moderation_context: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}
