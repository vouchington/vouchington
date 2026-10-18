import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import { CopyrightStaffQueue } from '../copyright-staff-queue'

vi.mock(import('@/hooks/use-pending-ai-refresh'), () => ({
  usePendingAiRefresh: vi.fn<typeof usePendingAiRefresh>(() => false),
}))

describe('copyright staff queue AI polling eligibility', () => {
  it.each([false, true])(
    'polls missing screening only while the form review is unreviewed: %s',
    reviewed => {
      const notice = makeCopyrightStaffQueueItem({
        form_review: {
          intake_id: 'intake-1',
          source_kind: 'guest_form',
          screening: null,
          review: reviewed
            ? { is_accepted: false, reviewed_at: '2026-01-02T00:00:00Z', reviewed_by_id: null }
            : null,
        },
      })
      render(
        <CopyrightStaffQueue
          data={{
            copyright_notices: [notice],
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }}
        />,
      )

      expect(vi.mocked(usePendingAiRefresh)).toHaveBeenCalledWith(
        !reviewed,
        expect.any(Function),
        reviewed ? '' : 'form:intake-1',
      )
    },
  )

  it('gives each pending child its own refresh deadline key', () => {
    const notice = makeCopyrightStaffQueueItem({
      appeals: [
        { submission_id: 'appeal-1', reason: 'First appeal', target_ids: [], recommendation: null },
      ],
    })
    const pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
    const { rerender } = render(
      <CopyrightStaffQueue data={{ copyright_notices: [notice], page_info: pageInfo }} />,
    )
    expect(vi.mocked(usePendingAiRefresh)).toHaveBeenLastCalledWith(
      true,
      expect.any(Function),
      'appeal:appeal-1',
    )

    rerender(
      <CopyrightStaffQueue
        data={{
          copyright_notices: [
            {
              ...notice,
              counter_notices: [
                {
                  submission_id: 'counter-2',
                  received_at: '2026-01-02T00:00:00Z',
                  target_ids: [],
                  statement: {},
                  guidance: null,
                },
              ],
            },
          ],
          page_info: pageInfo,
        }}
      />,
    )
    expect(vi.mocked(usePendingAiRefresh)).toHaveBeenLastCalledWith(
      true,
      expect.any(Function),
      'appeal:appeal-1|counter:counter-2',
    )
  })

  it.each([
    ['unassessed', null, true],
    [
      'assessed',
      {
        id: 'hold-assessment-1',
        is_from_original_claimant: true,
        proceeding_kind: 'federal_court' as const,
        ccb_claim_kind: null,
        commenced_at: '2026-01-01T00:00:00Z',
        received_by_designated_agent_at: '2026-01-01T00:00:00Z',
        is_same_material: true,
        target_ids: [],
        qualifying: true,
        resolved: false,
      },
      false,
    ],
  ])(
    'polls an %s legal hold with missing guidance only until assessment',
    (_name, assessment, pending) => {
      const notice = makeCopyrightStaffQueueItem({
        legal_holds: [
          {
            submission_id: 'hold-1',
            received_at: '2026-01-01T00:00:00Z',
            statement: {},
            guidance: null,
            assessment,
          },
        ],
      })

      render(
        <CopyrightStaffQueue
          data={{
            copyright_notices: [notice],
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }}
        />,
      )

      expect(vi.mocked(usePendingAiRefresh)).toHaveBeenLastCalledWith(
        pending,
        expect.any(Function),
        pending ? 'hold:hold-1' : '',
      )
    },
  )
})
