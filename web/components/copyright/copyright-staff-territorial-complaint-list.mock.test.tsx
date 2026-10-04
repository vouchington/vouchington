import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import {
  decideCopyrightTerritorialRedress,
  listCopyrightTerritorialComplaints,
  type CopyrightTerritorialComplaintsPage,
} from '@/lib/api/client/copyright-territorial-redress'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { CopyrightStaffTerritorialComplaintList } from './copyright-staff-territorial-complaint-list'

vi.mock(import('@/lib/api/client/copyright-territorial-redress'), () => ({
  decideCopyrightTerritorialRedress: vi.fn<typeof decideCopyrightTerritorialRedress>(),
  listCopyrightTerritorialComplaints: vi.fn<typeof listCopyrightTerritorialComplaints>(),
}))

const mockDecide = vi.mocked(decideCopyrightTerritorialRedress)
const mockList = vi.mocked(listCopyrightTerritorialComplaints)
const firstComplaint = {
  id: 'complaint-1',
  filed_by: 'poster' as const,
  submitted_by_user_id: 'poster-1',
  received_at: '2026-09-02T10:00:00Z',
  explanation: 'I have permission to use this image.',
  informed_at: '2026-09-01T10:00:00Z',
  window_ends_at: '2027-03-01T10:00:00Z',
  decision: null,
}
const complaints = [firstComplaint]

const item = makeCopyrightStaffQueueItem({
  id: 'notice-1',
  jurisdiction: 'eu_dsa',
  territorial: {
    notifier: { name: 'Notifier', email: 'notifier@example.test' },
    hosted_use_url: 'https://voucha.ai/discussion/image',
    grounds: 'The image reproduces my photograph.',
    acknowledgment: {
      attempt_count: 1,
      last_attempt_at: null,
      acknowledged_at: '2026-09-01T10:00:00Z',
      exhausted_at: null,
      escalated: false,
    },
    recipients: [],
    decision: {
      id: 'decision-1',
      outcome: 'restrict',
      decided_at: '2026-09-01T10:00:00Z',
      rationale: 'The match was verified.',
      public_explanation: 'The image reproduces the protected photograph.',
    },
    reopened_at: null,
    complaints,
    complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    dispute_settlements: [],
    dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  },
}) satisfies CopyrightStaffQueueItem

const complaintPage: CopyrightTerritorialComplaintsPage = {
  copyright_territorial_complaints: complaints,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

function renderReview(submit?: SubmitReview, initialPage = complaintPage) {
  render(
    <CopyrightStaffTerritorialComplaintList
      item={item}
      initialPage={initialPage}
      onReview={submit ?? (action => void action())}
      pending={false}
    />,
  )
}

describe('CopyrightStaffTerritorialComplaintList', () => {
  afterEach(() => vi.clearAllMocks())

  it.each(['maintain', 'revoke'] as const)(
    'requires a complainant rationale and records %s',
    async disposition => {
      renderReview()
      const label = disposition === 'maintain' ? 'Maintain' : 'Revoke'
      fireEvent.click(screen.getByRole('radio', { name: label }))
      const button = screen.getByRole('button', { name: `Record ${label} decision` })
      expect(button).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Rationale for the complainant'), {
        target: { value: 'The complainant provided a valid license.' },
      })
      fireEvent.click(screen.getByRole('button', { name: `Record ${label} decision` }))

      await waitFor(() => {
        expect(mockDecide).toHaveBeenCalledWith('eu_dsa', 'notice-1', 'complaint-1', {
          staff_disposition: disposition,
          rationale: 'The complainant provided a valid license.',
        })
      })
      expect(screen.getByText(/voids its repeat-infringer incident/)).toBeVisible()
      expect(screen.getByText(/returns the notice to staff for a new decision/)).toBeVisible()
    },
  )

  it('keeps the rationale in the form after a failed request', async () => {
    mockDecide.mockRejectedValueOnce(new Error('Request failed'))
    renderReview(action => void action().catch(() => undefined))
    const rationale = screen.getByLabelText('Rationale for the complainant')
    fireEvent.change(rationale, {
      target: { value: 'Keep the restriction with this explanation.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record Maintain decision' }))
    await waitFor(() => expect(mockDecide).toHaveBeenCalledOnce())
    expect(rationale).toHaveValue('Keep the restriction with this explanation.')
  })

  it('loads later complaints, retries a failed page, and deduplicates ids', async () => {
    mockList.mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce({
      copyright_territorial_complaints: [
        firstComplaint,
        {
          ...firstComplaint,
          id: 'complaint-2',
          explanation: 'A second complaint.',
        },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const initialPage: CopyrightTerritorialComplaintsPage = {
      ...complaintPage,
      page_info: { has_next_page: true, start_cursor: null, end_cursor: 'complaint-cursor' },
    }
    renderReview(undefined, initialPage)

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('A second complaint.')
    expect(mockList).toHaveBeenNthCalledWith(1, 'notice-1', { after: 'complaint-cursor' })
    expect(screen.getAllByText('I have permission to use this image.')).toHaveLength(1)
  })
})
