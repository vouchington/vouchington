import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { IntegrityPenaltyRecord } from '@/components/admin/use-integrity-penalties'
import type { ReportIntegrityPenalty } from '@/types/report-integrity'

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
    return <div data-testid='report-penalties-wrapper' />
  }
  return { IntegrityPenaltiesClient }
})
vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  getReportIntegrityPenaltyClient: mocks.getById,
  revokeReportAbusePenalty: mocks.revoke,
}))

import { ReportIntegrityPenaltiesClient } from './report-integrity-penalties-client'

const penalty: ReportIntegrityPenalty = {
  id: 'penalty-1',
  user_id: 'user-1',
  reason: 'mass_report_campaign',
  source_flag_id: 'flag-1',
  created_by_id: 'admin-1',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ReportIntegrityPenaltiesClient', () => {
  it('wires the report ledger without a multiplier', () => {
    const initialData = {
      results: [penalty],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    render(
      <ReportIntegrityPenaltiesClient
        initialData={initialData}
        initialStatus='active'
      />,
    )

    expect(screen.getByTestId('report-penalties-wrapper')).toBeInTheDocument()
    expect(mocks.renderIntegrityPenaltiesClient).toHaveBeenCalledTimes(1)
    const props = mocks.renderIntegrityPenaltiesClient.mock.calls[0]?.[0] as
      | CapturedIntegrityPenaltiesClientProps<ReportIntegrityPenalty>
      | undefined
    if (!props) throw new Error('Expected report penalty client props')
    expect(props).toMatchObject({
      domain: 'report',
      available: true,
      endpoint: '/api/v1/report-integrity/penalties',
      flagsPath: '/report-integrity/flags',
      initialData,
      initialStatus: 'active',
      penaltiesPath: '/report-integrity/penalties',
      getById: mocks.getById,
      revoke: mocks.revoke,
    })
    expect(props.multiplier(penalty)).toBeNull()
  })
})
