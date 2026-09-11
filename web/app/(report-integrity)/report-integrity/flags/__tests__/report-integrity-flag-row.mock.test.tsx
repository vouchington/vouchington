import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReportIntegrityFlag } from '@/types/report-integrity'
import type { ReportIntegrityFlagsTableProps } from '../report-integrity-flags-table'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)
vi.mock(import('../report-integrity-flag-actions'), () => ({
  PenalizeReportersButton: () => <button type='button'>Penalize reporters</button>,
  ResolveReportIntegrityFlagButton: () => <button type='button'>Resolve</button>,
}))
vi.mock(import('../report-integrity-entity-link'), () => ({
  EntityLink: () => <span>Target</span>,
}))
vi.mock(import('../report-integrity-flag-status'), () => ({
  ReportIntegrityFlagStatus: () => <span>Pending</span>,
}))

import { ReportIntegrityFlagRow } from '../report-integrity-flag-row'

const flag: ReportIntegrityFlag = {
  id: 'flag-1',
  post_id: null,
  reported_user_id: null,
  hostname_id: null,
  rss_feed_item_id: null,
  flag_type: 'mass_report_suspected',
  reporter_count: 4,
  new_account_reporter_pct: 0.5,
  details: { campaign: 'burst' },
  resolved_at: null,
  resolved_by_id: null,
  resolution: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('ReportIntegrityFlagRow', () => {
  it('retries reconciliation for the affected row', () => {
    const retryReconciliation = vi.fn<VitestLooseMock>()
    const state = {
      actionErrors: { [flag.id]: 'Result uncertain' },
      reconciliationRequired: { [flag.id]: true },
      resolutions: {},
      retryReconciliation,
      updateResolution: vi.fn<VitestLooseMock>(),
    } as unknown as ReportIntegrityFlagsTableProps

    render(
      <table>
        <tbody>
          <ReportIntegrityFlagRow
            flag={flag}
            state={state}
          />
        </tbody>
      </table>,
    )

    expect(screen.getByText('Result uncertain')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload result' }))
    expect(retryReconciliation).toHaveBeenCalledWith(flag.id)
  })
})
