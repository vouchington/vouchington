import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VoteIntegrityFlag } from '@/types/vote-integrity'
import type { VoteIntegrityFlagsTableProps } from './vote-integrity-flags-table'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        onValueChange,
        children,
      }: {
        onValueChange: (value: string) => void
        children: ReactNode
      }) => (
        <div>
          <button
            type='button'
            onClick={() => onValueChange('penalized')}
          >
            choose penalized
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
vi.mock(import('./vote-integrity-flag-actions'), () => ({
  ApplyPenaltyButton: () => <button type='button'>Apply penalty</button>,
  ResolveFlagButton: () => <button type='button'>Resolve</button>,
}))

import { VoteIntegrityFlagActions } from './vote-integrity-flag-row-actions'

const flag: VoteIntegrityFlag = {
  id: 'flag-1',
  post_id: null,
  topic_id: null,
  hostname_id: null,
  rss_feed_item_id: null,
  entity_relation_id: null,
  agent_moderation_id: null,
  flag_type: 'velocity_spike',
  details: {},
  resolved_at: null,
  resolved_by_id: null,
  resolution: null,
  created_at: '2026-01-01T00:00:00Z',
}

function state(overrides: Partial<VoteIntegrityFlagsTableProps> = {}) {
  return {
    actionLoading: {},
    actionErrors: {},
    resolutions: {},
    penaltyApplied: {},
    reconciliationRequired: {},
    retryReconciliation: vi.fn<VitestLooseMock>(),
    updateResolution: vi.fn<VitestLooseMock>(),
    ...overrides,
  } as unknown as VoteIntegrityFlagsTableProps
}

describe('VoteIntegrityFlagActions', () => {
  it('renders resolution audit metadata and actor navigation', () => {
    render(
      <VoteIntegrityFlagActions
        flag={{
          ...flag,
          resolved_at: '2026-02-02T12:00:00Z',
          resolved_by_id: 'admin-1',
          resolution: 'suspended',
        }}
        state={state()}
      />,
    )

    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-02-02T12:00:00Z')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/user/admin-1')
    expect(screen.getByText('by admin-1')).toBeInTheDocument()
  })

  it('shows the resolved time when no actor is recorded', () => {
    render(
      <VoteIntegrityFlagActions
        flag={{
          ...flag,
          resolved_at: '2026-02-02T12:00:00Z',
          resolution: 'dismissed',
        }}
        state={state()}
      />,
    )

    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-02-02T12:00:00Z')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers dismiss, penalize, and suspend without a resolution test id', () => {
    render(
      <VoteIntegrityFlagActions
        flag={flag}
        state={state()}
      />,
    )

    expect(document.querySelector('[aria-label="Resolution"]')).not.toHaveAttribute('data-pw')
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
    expect(screen.getByText('Penalize')).toBeInTheDocument()
    expect(screen.getByText('Suspend')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload result' })).not.toBeInTheDocument()
  })

  it('updates pending resolution selection and retries reconciliation', () => {
    const updateResolution = vi.fn<VitestLooseMock>()
    const retryReconciliation = vi.fn<VitestLooseMock>()
    render(
      <VoteIntegrityFlagActions
        flag={flag}
        state={state({
          actionErrors: { [flag.id]: 'Result uncertain' },
          reconciliationRequired: { [flag.id]: true },
          retryReconciliation,
          updateResolution,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'choose penalized' }))
    expect(updateResolution).toHaveBeenCalledWith(flag.id, 'penalized')
    expect(screen.getByText('Result uncertain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload result' }).parentElement).toHaveAttribute(
      'data-pw',
      'vote-integrity-flag-reconciliation',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload result' }))
    expect(retryReconciliation).toHaveBeenCalledWith(flag.id)
  })

  it('shows an action error without a reconciliation control', () => {
    render(
      <VoteIntegrityFlagActions
        flag={flag}
        state={state({ actionErrors: { [flag.id]: 'Result uncertain' } })}
      />,
    )

    expect(screen.getByText('Result uncertain')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload result' })).not.toBeInTheDocument()
  })
})
