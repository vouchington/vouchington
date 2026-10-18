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
})
