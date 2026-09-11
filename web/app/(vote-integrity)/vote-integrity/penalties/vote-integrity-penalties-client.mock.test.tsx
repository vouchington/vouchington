import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { IntegrityPenaltyRecord } from '@/components/admin/use-integrity-penalties'
import type { VoteIntegrityPenalty } from '@/types/vote-integrity'

type IntegrityPenaltiesClientComponent =
  (typeof import('@/components/admin/integrity-penalties-client'))['IntegrityPenaltiesClient']
type IntegrityPenaltiesClientProps = Parameters<IntegrityPenaltiesClientComponent>[0]
type CapturedIntegrityPenaltiesClientProps<P extends IntegrityPenaltyRecord> = Omit<
  IntegrityPenaltiesClientProps,
  'getById' | 'initialData' | 'multiplier' | 'revoke' | 'scopeGuard'
> & {
  getById: (id: string) => Promise<{ penalty: P }>
  initialData: IntegrityPenaltiesClientProps['initialData'] & { results: P[] }
  multiplier: (penalty: P) => string | null
  revoke: (id: string) => Promise<{ penalty: P }>
  scopeGuard?: (page: IntegrityPenaltiesClientProps['initialData'] & { results: P[] }) => boolean
}

const mocks = vi.hoisted(() => ({
  renderIntegrityPenaltiesClient: vi.fn<(props: unknown) => void>(),
  getById: vi.fn<VitestLooseMock>(),
  revoke: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/admin/integrity-penalties-client'), () => {
  const IntegrityPenaltiesClient: IntegrityPenaltiesClientComponent = props => {
    mocks.renderIntegrityPenaltiesClient(props)
    return <div data-testid='vote-penalties-wrapper' />
  }
  return { IntegrityPenaltiesClient }
})
vi.mock(import('@/lib/api/client/vote-integrity'), () => ({
  getVoteIntegrityPenaltyClient: mocks.getById,
  revokeVoteWeightPenalty: mocks.revoke,
}))

import { VoteIntegrityPenaltiesClient } from './vote-integrity-penalties-client'

const penalty: VoteIntegrityPenalty = {
  id: 'penalty-1',
  user_id: 'user-1',
  penalty_multiplier: 0.25,
  reason: 'voting_ring',
  source_flag_id: 'flag-1',
  created_by_id: 'admin-1',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('VoteIntegrityPenaltiesClient', () => {
  it('wires flag-only scope and formats the multiplier', () => {
    const initialData = {
      results: [penalty],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      filter_scope: { source: 'flag', source_flag_id: null },
    }
    render(
      <VoteIntegrityPenaltiesClient
        initialData={initialData}
        initialStatus='revoked'
      />,
    )

    expect(screen.getByTestId('vote-penalties-wrapper')).toBeInTheDocument()
    expect(mocks.renderIntegrityPenaltiesClient).toHaveBeenCalledTimes(1)
    const props = mocks.renderIntegrityPenaltiesClient.mock.calls[0]?.[0] as
      | CapturedIntegrityPenaltiesClientProps<VoteIntegrityPenalty>
      | undefined
    if (!props) throw new Error('Expected vote penalty client props')
    expect(props).toMatchObject({
      domain: 'vote',
      endpoint: '/api/v1/vote-integrity/penalties',
      flagsPath: '/vote-integrity/flags',
      initialData,
      initialStatus: 'revoked',
      paginationParams: { source: 'flag' },
      penaltiesPath: '/vote-integrity/penalties',
      getById: mocks.getById,
      revoke: mocks.revoke,
    })
    expect(props.multiplier(penalty)).toBe('0.25')
    expect(props.scopeGuard?.(initialData)).toBe(true)
  })
})
