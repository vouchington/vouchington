import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { recordCopyrightTerritorialAcknowledgmentFailure } from '@/lib/api/client/copyright-territorial-decisions'
import {
  listCopyrightTerritorialComplaints,
  listCopyrightTerritorialRecipients,
} from '@/lib/api/client/copyright-territorial-redress'
import { CopyrightStaffTerritorial } from './copyright-staff-territorial'

vi.mock(import('@/lib/api/client/copyright-territorial-decisions'), () => ({
  recordCopyrightTerritorialAcknowledgmentFailure:
    vi.fn<typeof recordCopyrightTerritorialAcknowledgmentFailure>(),
}))
vi.mock(import('@/lib/api/client/copyright-territorial-redress'), () => ({
  listCopyrightTerritorialComplaints: vi.fn<typeof listCopyrightTerritorialComplaints>(),
  listCopyrightTerritorialRecipients: vi.fn<typeof listCopyrightTerritorialRecipients>(),
}))
vi.mock(import('./copyright-staff-territorial-decision'), () => ({
  CopyrightStaffTerritorialDecision: () => <div>Territorial decision form</div>,
}))

const mockRecordFailure = vi.mocked(recordCopyrightTerritorialAcknowledgmentFailure)
const mockRecipients = vi.mocked(listCopyrightTerritorialRecipients)
const mockComplaints = vi.mocked(listCopyrightTerritorialComplaints)
const noMorePages = { has_next_page: false, start_cursor: null, end_cursor: null }

function makeItem(
  acknowledgment: NonNullable<CopyrightStaffQueueItem['territorial']>['acknowledgment'],
  jurisdiction: 'eu_dsa' | 'uk' = 'eu_dsa',
) {
  return makeCopyrightStaffQueueItem({
    id: 'notice-1',
    jurisdiction,
    claimant: { display_name: 'Mara Example', contact: 'Mara, 1 Main Street', misuse: null },
    work_description: 'An original photograph.',
    territorial: {
      notifier: { name: 'Mara Example', email: 'mara@example.test' },
      hosted_use_url: 'https://voucha.ai/discussion/park-photo',
      grounds: 'The post uses the photograph without permission.',
      acknowledgment,
      decision: null,
      reopened_at: null,
      complaint_count: 2,
      dispute_settlement_count: 1,
    },
  })
}

const openAcknowledgment = {
  attempt_count: 1,
  last_attempt_at: '2026-09-01T09:00:00Z',
  acknowledged_at: null,
  exhausted_at: null,
  escalated: false,
}

describe('CopyrightStaffTerritorial', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows notice facts and lets staff record an acknowledgment failure', async () => {
    render(
      <CopyrightStaffTerritorial
        item={makeItem(openAcknowledgment)}
        onReview={action => void action()}
        pending={false}
      />,
    )
    expect(screen.getByText('mara@example.test')).toBeVisible()
    expect(screen.getByText('The post uses the photograph without permission.')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'https://voucha.ai/discussion/park-photo' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Record failed acknowledgment' }))
    await waitFor(() => expect(mockRecordFailure).toHaveBeenCalledWith('eu_dsa', 'notice-1'))
  })

  it('does not offer another failure after acknowledgment is terminal', () => {
    render(
      <CopyrightStaffTerritorial
        item={makeItem({
          attempt_count: 3,
          last_attempt_at: '2026-09-01T09:00:00Z',
          acknowledged_at: null,
          exhausted_at: '2026-09-01T10:00:00Z',
          escalated: true,
        })}
        onReview={action => void action()}
        pending={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Record failed acknowledgment' })).toBeNull()
    expect(screen.getByText(/attempts are exhausted/)).toBeVisible()
  })

  it('counts the collections and loads them only when staff open the details', async () => {
    mockRecipients.mockResolvedValue({
      copyright_territorial_recipients: [
        { role: 'poster', user_id: 'poster-1', informed_at: '2026-09-01T10:00:00Z', state: 'sent' },
      ],
      page_info: noMorePages,
    })
    mockComplaints.mockResolvedValue({
      copyright_territorial_complaints: [],
      page_info: noMorePages,
    })
    render(
      <CopyrightStaffTerritorial
        item={makeItem(openAcknowledgment, 'uk')}
        onReview={action => void action()}
        pending={false}
      />,
    )
    expect(screen.getByText('2 complaints.')).toBeVisible()
    expect(mockRecipients).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Show deliveries, complaints and settlements' }),
    )
    expect(await screen.findByText(/Poster 1: sent/)).toBeVisible()
    expect(mockRecipients).toHaveBeenCalledWith('notice-1')
    expect(mockComplaints).toHaveBeenCalledWith('notice-1')
  })

  it('reports a case whose details could not be loaded', async () => {
    mockRecipients.mockRejectedValue(new Error('Request failed'))
    mockComplaints.mockResolvedValue({
      copyright_territorial_complaints: [],
      page_info: noMorePages,
    })
    render(
      <CopyrightStaffTerritorial
        item={makeItem(openAcknowledgment, 'uk')}
        onReview={action => void action()}
        pending={false}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Show deliveries, complaints and settlements' }),
    )
    expect(await screen.findByText('The case details could not be loaded.')).toBeVisible()
  })
})
