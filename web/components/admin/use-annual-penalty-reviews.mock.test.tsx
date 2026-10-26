import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { AnnualPenaltyReviews } from './annual-penalty-reviews'
import { IntegrityPenaltiesClient } from './integrity-penalties-client'
import { IntegrityPenaltyRow } from './integrity-penalty-row'
import { useIntegrityPenalties } from './use-integrity-penalties'

vi.mock(import('next/navigation'), () => navMockModule)
const penalty = {
  id: 'penalty-1',
  user_id: 'user-1',
  reason: 'voting_ring',
  source_flag_id: null,
  created_by_id: null,
  revoked_at: null as string | null,
  revoked_by_id: null,
  created_at: '2026-01-01T00:00:00Z',
}
const initialData = {
  results: [penalty],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('annual review reconciliation with the active table', () => {
  it.each([false, true])(
    'removes a queue-revoked active row even if the response is lost: %s',
    async lostResponse => {
      const duePenalty = {
        ...penalty,
        id: lostResponse ? 'annual-lost-response' : 'annual-confirmed',
        review_due_at: '2025-01-01T00:00:00Z',
        user_username: 'review-recipient',
      }
      const revoked = { ...duePenalty, revoked_at: '2026-01-01T00:00:00Z' }
      let committed = false
      const getById = vi.fn<(id: string) => Promise<{ penalty: typeof duePenalty }>>(async () => ({
        penalty: committed ? revoked : duePenalty,
      }))
      const revoke = vi.fn<(id: string) => Promise<{ penalty: typeof duePenalty }>>(async () => {
        committed = true
        if (lostResponse) throw new Error('response lost after commit')
        return { penalty: revoked }
      })
      const getDue = async () => ({
        results: committed ? [] : [duePenalty],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
      const annualInitialData = { ...initialData, results: [duePenalty] }
      function Harness() {
        const state = useIntegrityPenalties({
          endpoint: '/api/v1/report-integrity/penalties',
          initialData: annualInitialData,
          initialStatus: 'active',
          listPath: '/report-integrity/penalties',
          getById,
          revoke,
        })
        return (
          <>
            <AnnualPenaltyReviews
              excludedIds={state.removedIds}
              initialDuePage={annualInitialData}
              getDue={getDue}
              review={revoke}
              revoke={revoke}
              reconcile={state.reconcile}
            />
            {state.penalties.map(row => (
              <span key={row.id}>active:{row.id}</span>
            ))}
          </>
        )
      }
      render(<Harness />)
      await screen.findByText('review-recipient')
      expect(screen.getByText(`active:${duePenalty.id}`)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))
      await waitFor(() =>
        expect(screen.queryByText(`active:${duePenalty.id}`)).not.toBeInTheDocument(),
      )
      expect(getById).toHaveBeenCalledWith(duePenalty.id)
      expect(revoke).toHaveBeenCalledOnce()
    },
  )
  it('keeps a stale active row disabled with an explicit reconcile action when its exact read fails', async () => {
    const duePenalty = {
      ...penalty,
      id: '019f7000-0000-7000-8000-000000000101',
      user_id: '019f7000-0000-7000-8000-000000000102',
      review_due_at: '2025-01-01T00:00:00Z',
      user_username: 'uncertain-recipient',
    }
    const revoked = { ...duePenalty, revoked_at: '2026-01-01T00:00:00Z' }
    let committed = false
    const getById = vi
      .fn<(id: string) => Promise<{ penalty: typeof duePenalty }>>()
      .mockRejectedValueOnce(new Error('exact read unavailable'))
      .mockResolvedValue({ penalty: revoked })
    const revoke = vi.fn<(id: string) => Promise<{ penalty: typeof duePenalty }>>(async () => {
      committed = true
      return { penalty: revoked }
    })
    const getDue = async () => ({
      results: committed ? [] : [duePenalty],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const annualInitialData = { ...initialData, results: [duePenalty] }
    function Harness() {
      const state = useIntegrityPenalties({
        endpoint: '/api/v1/report-integrity/penalties',
        initialData: annualInitialData,
        initialStatus: 'active',
        listPath: '/report-integrity/penalties',
        getById,
        revoke,
      })
      return (
        <>
          <AnnualPenaltyReviews
            excludedIds={state.removedIds}
            initialDuePage={annualInitialData}
            getDue={getDue}
            review={revoke}
            revoke={revoke}
            reconcile={state.reconcile}
          />
          <table>
            <tbody>
              {state.penalties.map(row => (
                <IntegrityPenaltyRow
                  key={row.id}
                  domain='report'
                  initialStatus='active'
                  multiplier={null}
                  penalty={row}
                  state={state}
                />
              ))}
            </tbody>
          </table>
        </>
      )
    }
    render(<Harness />)
    const queueRow = (await screen.findByText('uncertain-recipient')).closest('li')!
    fireEvent.click(within(queueRow).getByRole('button', { name: 'Revoke' }))
    fireEvent.click(within(queueRow).getByRole('button', { name: 'Confirm revoke' }))
    const retry = await screen.findByRole('button', { name: 'Reload result' })
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled()
    expect(
      screen.getByText('The result is uncertain. Reload before trying again.'),
    ).toBeInTheDocument()
    fireEvent.click(retry)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /loading/i })).not.toBeInTheDocument(),
    )
    expect(revoke).toHaveBeenCalledOnce()
    expect(getById).toHaveBeenCalledTimes(2)
  })
  it('uses fresh server page data when navigating from a non-active ledger to active reviews', () => {
    const initialDuePage = {
      ...initialData,
      results: [
        { ...penalty, review_due_at: '2025-01-01T00:00:00Z', user_username: 'server-first-page' },
      ],
    }
    const getDue = vi.fn<() => Promise<typeof initialDuePage>>()
    const action = vi.fn<(id: string) => Promise<{ penalty: typeof penalty }>>()
    const props = {
      domain: 'report' as const,
      endpoint: '/api/v1/report-integrity/penalties',
      initialData,
      flagsPath: '/report-integrity/flags',
      penaltiesPath: '/report-integrity/penalties',
      multiplier: () => null,
      getById: action,
      revoke: action,
    }
    const view = render(
      <IntegrityPenaltiesClient
        {...props}
        initialStatus='revoked'
      />,
    )
    expect(screen.queryByText('server-first-page')).not.toBeInTheDocument()
    view.rerender(
      <IntegrityPenaltiesClient
        {...props}
        initialStatus='active'
        annualReviews={{ initialDuePage, getDue, review: action }}
      />,
    )
    expect(screen.getByText('server-first-page')).toBeInTheDocument()
    expect(getDue).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    'removes a table-revoked penalty from both surfaces, lost response: %s',
    async lostResponse => {
      const duePenalty = {
        ...penalty,
        id: '019f7000-0000-7000-8000-000000000181',
        user_id: '019f7000-0000-7000-8000-000000000182',
        review_due_at: '2025-01-01T00:00:00Z',
        user_username: 'table-revoke-recipient',
      }
      const revoked = { ...duePenalty, revoked_at: '2026-01-01T00:00:00Z' }
      const initialDuePage = { ...initialData, results: [duePenalty] }
      const revoke = vi.fn<(id: string) => Promise<{ penalty: typeof duePenalty }>>(async () => {
        if (lostResponse) throw new Error('response lost after commit')
        return { penalty: revoked }
      })
      const getById = vi
        .fn<(id: string) => Promise<{ penalty: typeof duePenalty }>>()
        .mockResolvedValue({ penalty: revoked })
      const getDue = vi.fn<() => Promise<typeof initialDuePage>>()
      render(
        <IntegrityPenaltiesClient
          domain='report'
          endpoint='/api/v1/report-integrity/penalties'
          initialData={initialDuePage}
          initialStatus='active'
          flagsPath='/report-integrity/flags'
          penaltiesPath='/report-integrity/penalties'
          multiplier={() => null}
          getById={getById}
          revoke={revoke}
          annualReviews={{ initialDuePage, getDue, review: revoke }}
        />,
      )
      const queue = screen.getByRole('link', { name: 'table-revoke-recipient' }).closest('section')!
      const table = screen.getByRole('table')
      fireEvent.click(within(table).getByRole('button', { name: 'Revoke' }))
      fireEvent.click(within(table).getByRole('button', { name: 'Confirm revoke' }))
      await waitFor(() =>
        expect(screen.queryByText('table-revoke-recipient')).not.toBeInTheDocument(),
      )
      expect(within(queue).queryByRole('listitem')).not.toBeInTheDocument()
      expect(within(queue).getByText('No penalties are due for review.')).toBeInTheDocument()
      expect(getDue).not.toHaveBeenCalled()
      expect(revoke).toHaveBeenCalledOnce()
      expect(getById.mock.calls).toEqual(lostResponse ? [[duePenalty.id]] : [])
    },
  )
})
