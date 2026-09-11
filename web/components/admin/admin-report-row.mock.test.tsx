import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminModerationReport } from './reports-client-types'
import { banEvasionReport as banEvasionReportFixture } from '@/storybook/entities/admin-reports.fixtures'
vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <time data-testid='time-ago'>{date}</time>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)
vi.mock(
  import('@/components/ui/popover'),
  () =>
    ({
      Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/popover'),
)
vi.mock(import('@/components/moderation/user-mod-notes-cell'), () => ({
  UserModNotesCell: () => <td aria-label='mod notes' />,
}))
vi.mock(
  import('./report-row-warn-button'),
  () =>
    ({
      ReportRowWarnButton: ({
        userId,
        reportId,
      }: {
        userId: string
        reportId: string
        disabled?: boolean
        onIssued?: () => void
      }) => (
        <button
          type='button'
          data-pw='report-row-warn-button'
          data-userid={userId}
          data-reportid={reportId}
        >
          Warn
        </button>
      ),
    }) as unknown as typeof import('./report-row-warn-button'),
)
vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  dismissCommunityBanEvasion: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))
vi.mock(
  import('@/lib/on-error'),
  () =>
    ({
      default: vi.fn<(err: unknown, options: { fallback: string }) => void>(),
    }) as unknown as typeof import('@/lib/on-error'),
)
import { AdminReportRow } from './admin-report-row'
import {
  confirmCommunityBanEvasion,
  dismissCommunityBanEvasion,
} from '@/lib/api/client/community-ban-evasion'
import onError from '@/lib/on-error'
const baseReport: AdminModerationReport = {
  id: 'report-1',
  case_id: 'case-1',
  created_at: '2026-05-31T00:00:00.000Z',
  reviewed_at: null,
  reporter_username: 'reporter',
  reporter_user_id: 'reporter-id',
  entity_type: 'post',
  entity_id: 'post-1',
  admin_action_path: null,
  target_label: 'Test post',
  target_content: null,
  target_path: '/posts/test-post',
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
}
describe('AdminReportRow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  it('does NOT render warn button when target_user_id is absent', () => {
    const { container } = render(
      <table>
        <tbody>
          <AdminReportRow
            active={false}
            disabled={false}
            onActiveChange={vi.fn<VitestLooseMock>()}
            onResolve={vi.fn<VitestLooseMock>()}
            onRerun={vi.fn<VitestLooseMock>()}
            onSelectionToggle={vi.fn<VitestLooseMock>()}
            report={baseReport}
            selected={false}
          />
        </tbody>
      </table>,
    )
    expect(container.querySelector('[data-pw="report-row-warn-button"]')).toBeNull()
  })
  it('renders warn button when target_user_id is set', () => {
    const report: AdminModerationReport = { ...baseReport, target_user_id: 'user-99' }
    const { container } = render(
      <table>
        <tbody>
          <AdminReportRow
            active={false}
            disabled={false}
            onActiveChange={vi.fn<VitestLooseMock>()}
            onResolve={vi.fn<VitestLooseMock>()}
            onRerun={vi.fn<VitestLooseMock>()}
            onSelectionToggle={vi.fn<VitestLooseMock>()}
            report={report}
            selected={false}
          />
        </tbody>
      </table>,
    )
    const warnBtn = container.querySelector('[data-pw="report-row-warn-button"]')
    expect(warnBtn).not.toBeNull()
    expect(warnBtn).toHaveAttribute('data-userid', 'user-99')
    expect(warnBtn).toHaveAttribute('data-reportid', 'report-1')
  })
  it('does NOT render warn button for non-pending reports even if target_user_id is set', () => {
    const report: AdminModerationReport = {
      ...baseReport,
      target_user_id: 'user-99',
      status: 'reviewed',
    }
    const { container } = render(
      <table>
        <tbody>
          <AdminReportRow
            active={false}
            disabled={false}
            onActiveChange={vi.fn<VitestLooseMock>()}
            onResolve={vi.fn<VitestLooseMock>()}
            onRerun={vi.fn<VitestLooseMock>()}
            onSelectionToggle={vi.fn<VitestLooseMock>()}
            report={report}
            selected={false}
          />
        </tbody>
      </table>,
    )
    expect(container.querySelector('[data-pw="report-row-warn-button"]')).toBeNull()
  })

  it('renders the report row with basic content', () => {
    render(
      <table>
        <tbody>
          <AdminReportRow
            active={false}
            disabled={false}
            onActiveChange={vi.fn<VitestLooseMock>()}
            onResolve={vi.fn<VitestLooseMock>()}
            onRerun={vi.fn<VitestLooseMock>()}
            onSelectionToggle={vi.fn<VitestLooseMock>()}
            report={baseReport}
            selected={false}
          />
        </tbody>
      </table>,
    )

    expect(screen.getByText('Test post')).toBeInTheDocument()
    expect(screen.getByText('spam')).toBeInTheDocument()
  })

  const banEvasionReport: AdminModerationReport = {
    ...baseReport,
    reporter_user_id: 'ban-evasion-user-id',
    reporter_username: 'ban-evasion',
    entity_type: 'user',
    entity_id: 'user-suspect',
    is_system_generated: true,
    community_ban_evasion: {
      community_id: 'community-1',
      community_slug: 'test-community',
      source_user_id: 'source-user-1',
      source_username: 'banned-user',
      score: 0.82,
      flagged_at: '2026-05-31T06:30:00.000Z',
    },
  }

  function renderBanEvasionRow(props?: Partial<Parameters<typeof AdminReportRow>[0]>) {
    return render(
      <table>
        <tbody>
          <AdminReportRow
            active={false}
            disabled={false}
            onActiveChange={vi.fn<VitestLooseMock>()}
            onResolve={vi.fn<VitestLooseMock>()}
            onRerun={vi.fn<VitestLooseMock>()}
            onSelectionToggle={vi.fn<VitestLooseMock>()}
            report={banEvasionReport}
            selected={false}
            {...props}
          />
        </tbody>
      </table>,
    )
  }

  it('renders ban-evasion badge and actions for system-generated report with ban_evasion context', () => {
    const { container } = renderBanEvasionRow()

    expect(container.querySelector('[data-pw="ban-evasion-badge"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="ban-evasion-confirm"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="ban-evasion-dismiss"]')).not.toBeNull()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('calls confirm/dismiss API and onBanEvasionAction when ban-evasion buttons are clicked', async () => {
    const onBanEvasionAction = vi.fn<VitestLooseMock>()

    const { container: confirmContainer } = renderBanEvasionRow({ onBanEvasionAction })
    fireEvent.click(confirmContainer.querySelector('[data-pw="ban-evasion-confirm"]')!)
    await vi.waitFor(() => expect(onBanEvasionAction).toHaveBeenCalledWith(banEvasionReport.id))
    expect(confirmCommunityBanEvasion).toHaveBeenCalledWith('community-1', 'user-suspect')

    vi.clearAllMocks()

    const { container: dismissContainer } = renderBanEvasionRow({ onBanEvasionAction })
    fireEvent.click(dismissContainer.querySelector('[data-pw="ban-evasion-dismiss"]')!)
    await vi.waitFor(() => expect(onBanEvasionAction).toHaveBeenCalledWith(banEvasionReport.id))
    expect(dismissCommunityBanEvasion).toHaveBeenCalledWith('community-1', 'user-suspect')
  })

  it('calls onError when confirmCommunityBanEvasion fails', async () => {
    const err = new Error('confirm failed')
    vi.mocked(confirmCommunityBanEvasion).mockRejectedValueOnce(err)

    const { container } = renderBanEvasionRow()
    fireEvent.click(container.querySelector('[data-pw="ban-evasion-confirm"]')!)

    await vi.waitFor(() =>
      expect(vi.mocked(onError)).toHaveBeenCalledWith(err, {
        fallback: 'Failed to confirm ban evasion',
      }),
    )
  })
  it('calls onError when dismissCommunityBanEvasion fails', async () => {
    const err = new Error('dismiss failed')
    vi.mocked(dismissCommunityBanEvasion).mockRejectedValueOnce(err)

    const { container } = renderBanEvasionRow()
    fireEvent.click(container.querySelector('[data-pw="ban-evasion-dismiss"]')!)

    await vi.waitFor(() =>
      expect(vi.mocked(onError)).toHaveBeenCalledWith(err, {
        fallback: 'Failed to dismiss ban-evasion flag',
      }),
    )
  })

  it('renders source_user_id span in popover when source_username is null', () => {
    const report: AdminModerationReport = {
      ...banEvasionReportFixture,
      community_ban_evasion: {
        ...banEvasionReportFixture.community_ban_evasion!,
        source_username: null,
      },
    }
    render(
      <table>
        <tbody>
          <AdminReportRow
            active={false}
            disabled={false}
            onActiveChange={vi.fn<VitestLooseMock>()}
            onResolve={vi.fn<VitestLooseMock>()}
            onRerun={vi.fn<VitestLooseMock>()}
            onSelectionToggle={vi.fn<VitestLooseMock>()}
            report={report}
            selected={false}
          />
        </tbody>
      </table>,
    )
    const sourceUserId = banEvasionReportFixture.community_ban_evasion!.source_user_id
    expect(sourceUserId).toBeDefined()
    expect(screen.getByText(sourceUserId!)).toBeInTheDocument()
  })
})
