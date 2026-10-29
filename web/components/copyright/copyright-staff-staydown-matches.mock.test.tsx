import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reviewCopyrightStaydownMatch } from '@/lib/api/client/copyright-staydown'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffQueue } from './copyright-staff-queue'

vi.mock(import('@/lib/api/client/copyright-staydown'), () => ({
  reviewCopyrightStaydownMatch: vi.fn<VitestLooseMock>(),
}))

const mockReview = vi.mocked(reviewCopyrightStaydownMatch)
const originalWindowLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')

describe('CopyrightStaffQueue possible re-uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReview.mockResolvedValue({ reviewed: true })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn<VitestLooseMock>() },
    })
  })

  afterEach(() => {
    if (originalWindowLocationDescriptor) {
      Object.defineProperty(window, 'location', originalWindowLocationDescriptor)
    }
  })

  it('shows each match with its reason and marks one reviewed without a rationale', async () => {
    render(
      <CopyrightStaffQueue
        data={{
          copyright_notices: [makeNotice()],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />,
    )

    expect(screen.getByText('Possible re-upload')).toBeInTheDocument()
    expect(
      screen.getByText(/Identical re-upload of an image this case confirmed/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Near-duplicate \(5 of 64 bits differ\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inspect matching image' })).toHaveAttribute(
      'href',
      '/images/placements/placement-1/2/upload-1?w=1200',
    )
    expect(screen.getAllByRole('link', { name: '@photographer' })[0]).toHaveAttribute(
      'href',
      '/user/photographer',
    )
    expect(screen.getByText('No inspectable published image is available.')).toBeInTheDocument()
    expect(screen.getByText(/More matches are waiting/)).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Mark reviewed' })
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[1]!)
    await waitFor(() => expect(mockReview).toHaveBeenCalledWith('case-123', 'match-2'))
  })

  it('associates a match with its original hosted use by target ID despite reversed target order', () => {
    const notice = makeNotice()
    notice.targets = makeBusyUsStaffCase()
      .targets.map(target => ({ ...target, image_id: 'registered-1' }))
      .toReversed()
    notice.staydown_matches = [{ ...notice.staydown_matches[0]!, target_id: 'target-1' }]
    render(
      <CopyrightStaffQueue
        data={{
          copyright_notices: [notice],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />,
    )
    expect(
      screen.getByRole('link', {
        name: 'Original hosted use: https://voucha.ai/discussion/park-photo',
      }),
    ).toHaveAttribute('href', 'https://voucha.ai/discussion/park-photo')
  })

  it('keeps a deleted uploader anonymous without exposing retained IDs', () => {
    const notice = makeNotice()
    notice.staydown_matches = [{ ...notice.staydown_matches[1]!, uploaded_by_username: null }]
    render(
      <CopyrightStaffQueue
        data={{
          copyright_notices: [notice],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />,
    )

    expect(screen.getByText(/A former member/)).toBeInTheDocument()
    expect(screen.getByText(/Original hosted use unavailable/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Inspect matching image' })).toBeNull()
    expect(screen.queryByText('user-2')).toBeNull()
    expect(screen.queryByText('upload-2')).toBeNull()
  })

  it('renders nothing for a case without matches', () => {
    render(
      <CopyrightStaffQueue
        data={{
          copyright_notices: [{ ...makeNotice(), staydown_matches: [], reasons: ['deadline_due'] }],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />,
    )

    expect(screen.queryByText('Possible re-uploads')).toBeNull()
  })
})

function makeNotice(): CopyrightStaffQueueItem {
  return {
    id: 'case-123',
    jurisdiction: 'us_dmca',
    received_at: '2026-01-01T00:00:00.000Z',
    claimant: { display_name: 'Claimant', contact: 'claimant@example.test', misuse: null },
    work_description: 'Original photograph.',
    targets: [],
    evidence: [],
    form_review: null,
    restrictions: [],
    appeals: [],
    counter_notices: [],
    legal_holds: [],
    action_intents: [],
    delivery_intents: [],
    staydown_matches: [
      {
        id: 'match-1',
        image_id: 'upload-1',
        registered_image_id: 'registered-1',
        target_id: 'target-1',
        uploaded_by_id: 'user-1',
        uploaded_by_username: 'photographer',
        image_placement: {
          image_id: 'upload-1',
          placement_id: 'placement-1',
          placement_revision: 2,
        },
        match_kind: 'exact',
        hamming_distance: 0,
        matched_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'match-2',
        image_id: 'upload-2',
        registered_image_id: 'registered-1',
        target_id: 'target-1',
        uploaded_by_id: 'user-2',
        uploaded_by_username: 'photographer',
        image_placement: null,
        match_kind: 'perceptual',
        hamming_distance: 5,
        matched_at: '2026-01-03T00:00:00.000Z',
      },
    ],
    staydown_matches_has_more: true,
    email_correspondence: [],
    reasons: ['staydown_review'],
    waiting_since: '2026-01-02T00:00:00.000Z',
    next_deadline: null,
  }
}
