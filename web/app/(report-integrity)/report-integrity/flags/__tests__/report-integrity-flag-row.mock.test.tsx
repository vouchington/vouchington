import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReportIntegrityFlag } from '@/types/report-integrity'
import type { ReportIntegrityFlagsTableProps } from '../report-integrity-flags-table'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        onValueChange,
        children,
      }: {
        onValueChange?: (value: string) => void
        children: ReactNode
      }) => (
        <div>
          <button
            type='button'
            onClick={() => onValueChange?.('dismissed')}
          >
            choose dismissed
          </button>
          {children}
        </div>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({
        children,
        ...props
      }: {
        children: ReactNode
        'aria-label'?: string
        'data-pw'?: string
      }) => (
        <div
          aria-label={props['aria-label']}
          data-pw={props['data-pw']}
        >
          {children}
        </div>
      ),
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
  new_account_reporter_percent: 0.5,
  details: { campaign: 'burst' },
  resolved_at: null,
  resolved_by_id: null,
  resolution: null,
  created_at: '2026-01-01T00:00:00Z',
}

function state(overrides: Partial<ReportIntegrityFlagsTableProps> = {}) {
  return {
    actionErrors: {},
    reconciliationRequired: {},
    resolutions: {},
    retryReconciliation: vi.fn<VitestLooseMock>(),
    updateResolution: vi.fn<VitestLooseMock>(),
    ...overrides,
  } as unknown as ReportIntegrityFlagsTableProps
}

function renderRow(nextFlag: ReportIntegrityFlag, nextState = state()) {
  return render(
    <table>
      <tbody>
        <ReportIntegrityFlagRow
          flag={nextFlag}
          state={nextState}
        />
      </tbody>
    </table>,
  )
}

describe('ReportIntegrityFlagRow', () => {
  it('offers only dismissal and records that resolution', () => {
    const updateResolution = vi.fn<VitestLooseMock>()
    renderRow(flag, state({ updateResolution }))

    expect(document.querySelector('[aria-label="Resolution"]')).toHaveAttribute(
      'data-pw',
      'report-integrity-resolution-select',
    )
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
    expect(screen.queryByText('Penalize')).not.toBeInTheDocument()
    expect(screen.queryByText('Suspend')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload result' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'choose dismissed' }))
    expect(updateResolution).toHaveBeenCalledWith(flag.id, 'dismissed')
  })

  it('retries reconciliation for the affected row', () => {
    const retryReconciliation = vi.fn<VitestLooseMock>()
    renderRow(
      flag,
      state({
        actionErrors: { [flag.id]: 'Result uncertain' },
        reconciliationRequired: { [flag.id]: true },
        retryReconciliation,
      }),
    )

    expect(screen.getByText('Result uncertain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload result' }).parentElement).toHaveAttribute(
      'data-pw',
      'report-integrity-flag-reconciliation',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload result' }))
    expect(retryReconciliation).toHaveBeenCalledWith(flag.id)
  })

  it('shows an action error without a reconciliation control', () => {
    renderRow(flag, state({ actionErrors: { [flag.id]: 'Result uncertain' } }))

    expect(screen.getByText('Result uncertain')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload result' })).not.toBeInTheDocument()
  })

  it('shows the resolving actor after the flag is resolved', () => {
    renderRow({
      ...flag,
      resolution: 'dismissed',
      resolved_at: '2026-02-02T12:00:00Z',
      resolved_by_id: 'admin-1',
    })

    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-02-02T12:00:00Z')
    expect(screen.getByRole('link', { name: 'by admin-1' })).toHaveAttribute(
      'href',
      '/user/admin-1',
    )
    expect(document.querySelector('[aria-label="Resolution"]')).not.toBeInTheDocument()
  })

  it('shows the resolved time when no actor is recorded', () => {
    renderRow({
      ...flag,
      resolution: 'dismissed',
      resolved_at: '2026-02-02T12:00:00Z',
    })

    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-02-02T12:00:00Z')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
