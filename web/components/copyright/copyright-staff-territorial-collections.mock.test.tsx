import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import {
  listCopyrightEuStaffDisputeSettlements,
  listCopyrightTerritorialClaimants,
  listCopyrightTerritorialComplaints,
  listCopyrightTerritorialPosters,
  type CopyrightTerritorialClaimantsPage,
  type CopyrightTerritorialPostersPage,
} from '@/lib/api/client/copyright-territorial-redress'
import { CopyrightStaffTerritorialCollections } from './copyright-staff-territorial-collections'

vi.mock(import('@/lib/api/client/copyright-territorial-redress'), () => ({
  listCopyrightEuStaffDisputeSettlements: vi.fn<typeof listCopyrightEuStaffDisputeSettlements>(),
  listCopyrightTerritorialClaimants: vi.fn<typeof listCopyrightTerritorialClaimants>(),
  listCopyrightTerritorialComplaints: vi.fn<typeof listCopyrightTerritorialComplaints>(),
  listCopyrightTerritorialPosters: vi.fn<typeof listCopyrightTerritorialPosters>(),
}))
vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock(import('./copyright-staff-territorial-complaint-list'), () => ({
  CopyrightStaffTerritorialComplaintList: () => <div>Complaint list</div>,
}))
vi.mock(import('./copyright-staff-territorial-dispute-list'), () => ({
  CopyrightStaffTerritorialDisputeList: () => <div>Settlement list</div>,
}))
vi.mock(import('./copyright-staff-territorial-dispute-referral'), () => ({
  CopyrightStaffTerritorialReferralFields: () => <div>Referral form</div>,
}))

const mockPosters = vi.mocked(listCopyrightTerritorialPosters)
const mockClaimants = vi.mocked(listCopyrightTerritorialClaimants)
const mockComplaints = vi.mocked(listCopyrightTerritorialComplaints)
const mockSettlements = vi.mocked(listCopyrightEuStaffDisputeSettlements)
const noMorePages = { has_next_page: false, start_cursor: null, end_cursor: null }

/** Answers by cursor so a repeated read of the same page gets the same answer. */
function answerPosters(pages: Record<string, CopyrightTerritorialPostersPage | Error>) {
  mockPosters.mockImplementation((_noticeId, options) => {
    const answer = pages[options?.after ?? 'first']!
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  })
}

function answerClaimants(pages: Record<string, CopyrightTerritorialClaimantsPage | Error>) {
  mockClaimants.mockImplementation((_noticeId, options) => {
    const answer = pages[options?.after ?? 'first']!
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  })
}

function postersPage(
  target: string,
  user: string | null,
  next: string | null,
): CopyrightTerritorialPostersPage {
  return {
    copyright_territorial_posters: [
      { target_id: target, user_id: user, informed_at: '2026-09-01T10:00:00Z', state: 'sent' },
    ],
    page_info: { has_next_page: next !== null, start_cursor: null, end_cursor: next },
  }
}

function claimantsPage(receipt: string, next: string | null): CopyrightTerritorialClaimantsPage {
  return {
    copyright_territorial_claimants: [
      { receipt_id: receipt, user_id: 'notifier-1', informed_at: null, state: null },
    ],
    page_info: { has_next_page: next !== null, start_cursor: null, end_cursor: next },
  }
}

function makeItem(jurisdiction: 'eu_dsa' | 'uk') {
  return makeCopyrightStaffQueueItem({
    id: 'notice-1',
    jurisdiction,
    territorial: {
      notifier: { name: 'Mara', email: 'mara@example.test' },
      hosted_use_url: 'https://voucha.ai/discussion/park-photo',
      grounds: 'The post uses the photograph without permission.',
      acknowledgment: {
        attempt_count: 1,
        last_attempt_at: null,
        acknowledged_at: '2026-09-01T10:00:00Z',
        exhausted_at: null,
        escalated: false,
      },
      decision: {
        id: 'decision-1',
        outcome: 'restrict',
        decided_at: '2026-09-01T10:00:00Z',
        rationale: 'Clear match.',
        public_explanation: 'Clear match.',
      },
      reopened_at: null,
      complaint_count: 0,
      dispute_settlement_count: 0,
    },
  })
}

function renderCollections(jurisdiction: 'eu_dsa' | 'uk') {
  mockComplaints.mockResolvedValue({
    copyright_territorial_complaints: [],
    page_info: noMorePages,
  })
  mockSettlements.mockResolvedValue({
    copyright_eu_dispute_settlements: [],
    page_info: noMorePages,
  })
  render(
    <CopyrightStaffTerritorialCollections
      item={makeItem(jurisdiction)}
      pending={false}
      onReview={action => void action()}
      onClose={() => undefined}
    />,
  )
}

describe('CopyrightStaffTerritorialCollections', () => {
  afterEach(() => vi.resetAllMocks())

  it('loads one page of each list on open and the rest only when staff start a referral', async () => {
    answerPosters({
      first: postersPage('target-1', 'poster-1', 'c1'),
      c1: postersPage('target-2', 'poster-1', 'c2'),
      c2: postersPage('target-3', 'poster-3', null),
    })
    answerClaimants({
      first: claimantsPage('receipt-1', 'r1'),
      r1: claimantsPage('receipt-2', null),
    })
    renderCollections('eu_dsa')
    expect(await screen.findByText(/Poster 1: sent/)).toBeVisible()
    expect(mockPosters).toHaveBeenCalledTimes(1)
    expect(mockClaimants).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Referral form')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Record referral' }))
    expect(await screen.findByText('Referral form')).toBeVisible()
    expect(mockPosters).toHaveBeenCalledTimes(3)
    expect(mockPosters).toHaveBeenLastCalledWith('notice-1', { after: 'c2' })
    expect(mockClaimants).toHaveBeenCalledTimes(2)
    expect(mockClaimants).toHaveBeenLastCalledWith('notice-1', { after: 'r1' })
    // Poster 1 sits on two targets, so it has a row for each; the form is still offered once the
    // lists end because completeness is about pages, not distinct accounts.
    expect(screen.getAllByText(/Poster \d: sent/)).toHaveLength(3)
  })

  it('walks the claimant list too before the form appears', async () => {
    answerPosters({ first: postersPage('target-1', 'poster-1', null) })
    answerClaimants({
      first: claimantsPage('receipt-1', 'r1'),
      r1: claimantsPage('receipt-2', null),
    })
    renderCollections('eu_dsa')
    fireEvent.click(await screen.findByRole('button', { name: 'Record referral' }))
    expect(await screen.findByText('Referral form')).toBeVisible()
    expect(mockPosters).toHaveBeenCalledTimes(1)
    expect(mockClaimants).toHaveBeenCalledTimes(2)
  })

  it('offers no referral action on a UK case and loads no further page', async () => {
    answerPosters({ first: postersPage('target-1', 'poster-1', 'c1') })
    answerClaimants({ first: claimantsPage('receipt-1', null) })
    renderCollections('uk')
    expect(await screen.findByText(/Poster 1: sent/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Record referral' })).toBeNull()
    expect(mockPosters).toHaveBeenCalledTimes(1)
  })

  it('shows a failure when a page fails and continues the walk on retry', async () => {
    answerPosters({
      first: postersPage('target-1', 'poster-1', 'c1'),
      c1: new Error('Request failed'),
    })
    answerClaimants({ first: claimantsPage('receipt-1', null) })
    renderCollections('eu_dsa')
    fireEvent.click(await screen.findByRole('button', { name: 'Record referral' }))
    expect(await screen.findByText(/could not all be loaded/)).toBeVisible()
    expect(screen.queryByText(/Loading every poster/)).toBeNull()
    expect(screen.queryByText('Referral form')).toBeNull()
    expect(mockPosters).toHaveBeenCalledTimes(2)

    answerPosters({
      first: postersPage('target-1', 'poster-1', 'c1'),
      c1: postersPage('target-2', 'poster-2', null),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Referral form')).toBeVisible()
    expect(mockPosters).toHaveBeenCalledTimes(3)
  })

  it('shows a failure when a claimant page fails', async () => {
    answerPosters({ first: postersPage('target-1', 'poster-1', null) })
    answerClaimants({
      first: claimantsPage('receipt-1', 'r1'),
      r1: new Error('Request failed'),
    })
    renderCollections('eu_dsa')
    fireEvent.click(await screen.findByRole('button', { name: 'Record referral' }))
    expect(await screen.findByText(/could not all be loaded/)).toBeVisible()
    expect(screen.queryByText('Referral form')).toBeNull()
  })
})
