import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminModerationReport } from '../reports-client-types'

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
      PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/popover'),
)

vi.mock(import('@/components/moderation/user-mod-notes-cell'), () => ({
  UserModNotesCell: () => (
    <td
      data-pw='user-mod-notes-cell'
      aria-label='mod notes'
    />
  ),
}))

vi.mock(
  import('../report-row-warn-button'),
  () =>
    ({
      ReportRowWarnButton: () => <button type='button'>Warn</button>,
    }) as unknown as typeof import('../report-row-warn-button'),
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

import { AdminReportRow } from '../admin-report-row'

const report: AdminModerationReport = {
  id: 'report-1',
  case_id: 'case-1',
  created_at: '2026-05-31T00:00:00.000Z',
  reviewed_at: null,
  reporter_username: 'reporter',
  reporter_user_id: 'reporter-id',
  entity_type: 'post',
  entity_id: 'post-1',
  admin_action_path: null,
  target_content: null,
  target_label: 'Test post',
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
  judgement: {
    recommended_action: 'warn',
    public_response: 'Public.',
    internal_response: 'Internal.',
    is_stale: true,
    judged_report_count: 1,
    current_report_count: 2,
  },
  post_moderation_context: null,
}

describe('AdminReportRow judgement', () => {
  it('hides ordinary actions for a system-generated report with missing context', () => {
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
            report={{ ...report, is_system_generated: true, community_ban_evasion: null }}
            selected={false}
          />
        </tbody>
      </table>,
    )

    expect(screen.queryByRole('button', { name: /reviewed/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^dismiss /i })).not.toBeInTheDocument()
    expect(screen.queryByText('Warn')).not.toBeInTheDocument()
  })

  it('renders the stale judgement badge as phrasing content', () => {
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

    const staleBadge = screen.getByText('Outdated')
    expect(staleBadge.tagName).toBe('SPAN')
    expect(container.querySelector('button div')).toBeNull()
  })
})
