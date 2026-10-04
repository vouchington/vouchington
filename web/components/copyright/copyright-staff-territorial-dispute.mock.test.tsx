import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import {
  recordCopyrightEuDisputeSettlementImplementation,
  recordCopyrightEuDisputeSettlementOutcome,
  listCopyrightEuStaffDisputeSettlements,
  referCopyrightEuDisputeSettlement,
  type CopyrightEuDisputeSettlementsPage,
} from '@/lib/api/client/copyright-territorial-redress'
import { CopyrightStaffTerritorialDispute } from './copyright-staff-territorial-dispute'

vi.mock(import('@/lib/api/client/copyright-territorial-redress'), () => ({
  recordCopyrightEuDisputeSettlementImplementation:
    vi.fn<typeof recordCopyrightEuDisputeSettlementImplementation>(),
  recordCopyrightEuDisputeSettlementOutcome:
    vi.fn<typeof recordCopyrightEuDisputeSettlementOutcome>(),
  listCopyrightEuStaffDisputeSettlements: vi.fn<typeof listCopyrightEuStaffDisputeSettlements>(),
  referCopyrightEuDisputeSettlement: vi.fn<typeof referCopyrightEuDisputeSettlement>(),
}))

const mockRefer = vi.mocked(referCopyrightEuDisputeSettlement)
const mockOutcome = vi.mocked(recordCopyrightEuDisputeSettlementOutcome)
const mockImplementation = vi.mocked(recordCopyrightEuDisputeSettlementImplementation)
const mockList = vi.mocked(listCopyrightEuStaffDisputeSettlements)

type Settlements = NonNullable<CopyrightStaffQueueItem['territorial']>['dispute_settlements']

function makeItem(outcome: Settlements) {
  return makeCopyrightStaffQueueItem({
    id: 'notice-1',
    jurisdiction: 'eu_dsa',
    targets: [
      {
        id: 'target-1',
        placement_key: 'image-placement:one',
        placement_revision: 1,
        image_id: 'image-1',
        surface: 'post-image',
        hosted_use_url: 'https://voucha.ai/discussion/image',
        provenance: null,
      },
    ],
    territorial: {
      notifier: { name: 'Notifier', email: 'notifier@example.test' },
      hosted_use_url: 'https://voucha.ai/discussion/image',
      grounds: 'The image reproduces a photograph.',
      acknowledgment: {
        attempt_count: 1,
        last_attempt_at: null,
        acknowledged_at: '2026-09-01T10:00:00Z',
        exhausted_at: null,
        escalated: false,
      },
      recipients: [
        { role: 'claimant', user_id: null, informed_at: null, state: null },
        { role: 'poster', user_id: 'poster-1', informed_at: '2026-09-01T10:00:00Z', state: 'sent' },
      ],
      decision: {
        id: 'decision-1',
        outcome: 'restrict',
        decided_at: '2026-09-01T10:00:00Z',
        rationale: 'The match is clear.',
        public_explanation: 'The image reproduces the photograph.',
      },
      reopened_at: null,
      complaints: [],
      complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      dispute_settlements: outcome,
      dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
  })
}

function makePage(settlements: Settlements): CopyrightEuDisputeSettlementsPage {
  return {
    copyright_eu_dispute_settlements: settlements,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

const submit = (action: () => Promise<unknown>) => void action()

describe('CopyrightStaffTerritorialDispute', () => {
  afterEach(() => vi.clearAllMocks())

  it('records a guest notifier referral without requiring a user id', async () => {
    render(
      <CopyrightStaffTerritorialDispute
        item={makeItem([])}
        initialPage={makePage([])}
        onReview={submit}
        pending={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Dispute settlement body'), {
      target: { value: 'Independent dispute body' },
    })
    fireEvent.click(screen.getByRole('combobox', { name: 'Party that referred the dispute' }))
    fireEvent.click(screen.getByRole('option', { name: /^Notifier$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record referral' }))
    await waitFor(() => expect(mockRefer).toHaveBeenCalledOnce())
    const [noticeId, input] = mockRefer.mock.calls[0]!
    expect(noticeId).toBe('notice-1')
    expect(input).toMatchObject({
      body_name: 'Independent dispute body',
      referred_by_party: 'notifier',
    })
    expect(input).not.toHaveProperty('referred_by_user_id')
    expect(new Date(input.referred_at).toString()).not.toBe('Invalid Date')
  })

  it('uses the notice recipient as poster when target provenance is unavailable', async () => {
    render(
      <CopyrightStaffTerritorialDispute
        item={makeItem([])}
        initialPage={makePage([])}
        onReview={submit}
        pending={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Dispute settlement body'), {
      target: { value: 'Independent dispute body' },
    })
    fireEvent.click(screen.getByRole('combobox', { name: 'Party that referred the dispute' }))
    fireEvent.click(screen.getByRole('option', { name: /^Poster$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record referral' }))
    await waitFor(() => expect(mockRefer).toHaveBeenCalledOnce())
    expect(mockRefer.mock.calls[0]?.[1]).toMatchObject({
      referred_by_party: 'poster',
      referred_by_user_id: 'poster-1',
    })
  })

  it('records a body outcome and a separate implementation date', async () => {
    const referral = {
      id: 'referral-1',
      body_name: 'Independent dispute body',
      referred_at: '2026-09-01T10:00:00Z',
      referred_by_party: 'poster' as const,
      referred_by_user_id: 'poster-1',
      outcome: null,
    }
    const outcomeItem = makeItem([referral])
    const { unmount } = render(
      <CopyrightStaffTerritorialDispute
        item={outcomeItem}
        initialPage={makePage([referral])}
        onReview={submit}
        pending={false}
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Body outcome' }))
    fireEvent.click(screen.getByRole('option', { name: /^Decided for the recipient$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await waitFor(() => {
      expect(mockOutcome).toHaveBeenCalledWith(
        'notice-1',
        'referral-1',
        expect.objectContaining({ result: 'decided_for_recipient' }),
      )
    })
    unmount()

    const implementedItem = makeItem([
      {
        ...referral,
        outcome: {
          result: 'decided_for_recipient',
          decided_at: '2026-09-02T10:00:00Z',
          implemented_at: null,
        },
      },
    ])
    render(
      <CopyrightStaffTerritorialDispute
        item={implementedItem}
        initialPage={makePage([
          {
            ...referral,
            outcome: {
              result: 'decided_for_recipient',
              decided_at: '2026-09-02T10:00:00Z',
              implemented_at: null,
            },
          },
        ])}
        onReview={submit}
        pending={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Record implementation' }))
    await waitFor(() => {
      expect(mockImplementation).toHaveBeenCalledWith(
        'notice-1',
        'referral-1',
        expect.objectContaining({ implemented_at: expect.any(String) }),
      )
    })
  })

  it('keeps the referral fields after a failed request', async () => {
    mockRefer.mockRejectedValueOnce(new Error('Request failed'))
    render(
      <CopyrightStaffTerritorialDispute
        item={makeItem([])}
        initialPage={makePage([])}
        onReview={action => void action().catch(() => undefined)}
        pending={false}
      />,
    )
    const body = screen.getByLabelText('Dispute settlement body')
    fireEvent.change(body, { target: { value: 'Independent dispute body' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Party that referred the dispute' }))
    fireEvent.click(screen.getByRole('option', { name: /^Notifier$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record referral' }))
    await waitFor(() => expect(mockRefer).toHaveBeenCalledOnce())
    expect(body).toHaveValue('Independent dispute body')
  })

  it('loads later EU referrals and deduplicates them by id', async () => {
    const first = {
      id: 'referral-1',
      body_name: 'Independent dispute body',
      referred_at: '2026-09-01T10:00:00Z',
      referred_by_party: 'poster' as const,
      referred_by_user_id: 'poster-1',
      outcome: null,
    }
    mockList.mockResolvedValueOnce({
      copyright_eu_dispute_settlements: [
        first,
        { ...first, id: 'referral-2', body_name: 'Second dispute body' },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const initialPage: CopyrightEuDisputeSettlementsPage = {
      copyright_eu_dispute_settlements: [first],
      page_info: {
        has_next_page: true,
        start_cursor: null,
        end_cursor: 'settlement-cursor',
      },
    }
    render(
      <CopyrightStaffTerritorialDispute
        item={makeItem([first])}
        initialPage={initialPage}
        onReview={submit}
        pending={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Second dispute body')
    expect(mockList).toHaveBeenCalledWith('notice-1', { after: 'settlement-cursor' })
    expect(screen.getAllByText('Independent dispute body')).toHaveLength(1)
  })
})
