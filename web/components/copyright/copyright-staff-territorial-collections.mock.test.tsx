import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import {
  listCopyrightEuStaffDisputeSettlements,
  listCopyrightTerritorialComplaints,
  listCopyrightTerritorialRecipients,
  type CopyrightTerritorialRecipientsPage,
} from '@/lib/api/client/copyright-territorial-redress'
import { CopyrightStaffTerritorialCollections } from './copyright-staff-territorial-collections'

vi.mock(import('@/lib/api/client/copyright-territorial-redress'), () => ({
  listCopyrightEuStaffDisputeSettlements: vi.fn<typeof listCopyrightEuStaffDisputeSettlements>(),
  listCopyrightTerritorialComplaints: vi.fn<typeof listCopyrightTerritorialComplaints>(),
  listCopyrightTerritorialRecipients: vi.fn<typeof listCopyrightTerritorialRecipients>(),
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

const mockRecipients = vi.mocked(listCopyrightTerritorialRecipients)
const mockComplaints = vi.mocked(listCopyrightTerritorialComplaints)
const mockSettlements = vi.mocked(listCopyrightEuStaffDisputeSettlements)
/** Answers by cursor so a repeated read of the same page gets the same answer. */
function answerRecipients(pages: Record<string, CopyrightTerritorialRecipientsPage | Error>) {
  mockRecipients.mockImplementation((_noticeId, options) => {
    const answer = pages[options?.after ?? 'first']!
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  })
}
const noMorePages = { has_next_page: false, start_cursor: null, end_cursor: null }

function recipientsPage(user: string, next: string | null): CopyrightTerritorialRecipientsPage {
  return {
    copyright_territorial_recipients: [
      { role: 'poster', user_id: user, informed_at: '2026-09-01T10:00:00Z', state: 'sent' },
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

  it('loads one recipient page on open and the rest only when staff start a referral', async () => {
    answerRecipients({
      first: recipientsPage('poster-1', 'c1'),
      c1: recipientsPage('poster-2', 'c2'),
      c2: recipientsPage('poster-3', null),
    })
    renderCollections('eu_dsa')
    expect(await screen.findByText(/Poster 1: sent/)).toBeVisible()
    expect(mockRecipients).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Referral form')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Record referral' }))
    expect(await screen.findByText('Referral form')).toBeVisible()
    expect(mockRecipients).toHaveBeenCalledTimes(3)
    expect(mockRecipients).toHaveBeenLastCalledWith('notice-1', { after: 'c2' })
    expect(screen.getByText(/Poster 3: sent/)).toBeVisible()
  })

  it('offers no referral action on a UK case and loads no further page', async () => {
    answerRecipients({ first: recipientsPage('poster-1', 'c1') })
    renderCollections('uk')
    expect(await screen.findByText(/Poster 1: sent/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Record referral' })).toBeNull()
    expect(mockRecipients).toHaveBeenCalledTimes(1)
  })

  it('shows a failure when a page fails and continues the walk on retry', async () => {
    answerRecipients({ first: recipientsPage('poster-1', 'c1'), c1: new Error('Request failed') })
    renderCollections('eu_dsa')
    fireEvent.click(await screen.findByRole('button', { name: 'Record referral' }))
    expect(await screen.findByText(/could not all be loaded/)).toBeVisible()
    expect(screen.queryByText(/Loading every poster/)).toBeNull()
    expect(screen.queryByText('Referral form')).toBeNull()
    expect(mockRecipients).toHaveBeenCalledTimes(2)

    answerRecipients({
      first: recipientsPage('poster-1', 'c1'),
      c1: recipientsPage('poster-2', null),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Referral form')).toBeVisible()
    expect(mockRecipients).toHaveBeenCalledTimes(3)
  })
})
