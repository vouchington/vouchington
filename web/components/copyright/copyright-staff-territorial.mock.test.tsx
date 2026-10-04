import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { recordCopyrightTerritorialAcknowledgmentFailure } from '@/lib/api/client/copyright-territorial-decisions'
import { CopyrightStaffTerritorial } from './copyright-staff-territorial'

vi.mock(import('@/lib/api/client/copyright-territorial-decisions'), () => ({
  recordCopyrightTerritorialAcknowledgmentFailure:
    vi.fn<typeof recordCopyrightTerritorialAcknowledgmentFailure>(),
}))
vi.mock(import('./copyright-staff-territorial-decision'), () => ({
  CopyrightStaffTerritorialDecision: () => <div>Territorial decision form</div>,
}))

const mockRecordFailure = vi.mocked(recordCopyrightTerritorialAcknowledgmentFailure)

function makeItem(
  acknowledgment: NonNullable<CopyrightStaffQueueItem['territorial']>['acknowledgment'],
) {
  return makeCopyrightStaffQueueItem({
    id: 'notice-1',
    jurisdiction: 'eu_dsa',
    claimant: { display_name: 'Mara Example', contact: 'Mara, 1 Main Street', misuse: null },
    work_description: 'An original photograph.',
    territorial: {
      notifier: { name: 'Mara Example', email: 'mara@example.test' },
      hosted_use_url: 'https://voucha.ai/discussion/park-photo',
      grounds: 'The post uses the photograph without permission.',
      acknowledgment,
      recipients: [
        {
          role: 'poster',
          user_id: 'poster-1',
          informed_at: '2026-09-01T10:00:00Z',
          state: 'sent',
        },
      ],
      decision: null,
      reopened_at: null,
      complaints: [],
      complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      dispute_settlements: [],
      dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
  })
}

describe('CopyrightStaffTerritorial', () => {
  it('shows notice facts and lets staff record an acknowledgment failure', async () => {
    const item = makeItem({
      attempt_count: 1,
      last_attempt_at: '2026-09-01T09:00:00Z',
      acknowledged_at: null,
      exhausted_at: null,
      escalated: false,
    })
    render(
      <CopyrightStaffTerritorial
        item={item}
        onReview={action => void action()}
        pending={false}
      />,
    )
    expect(screen.getByText('mara@example.test')).toBeVisible()
    expect(screen.getByText('The post uses the photograph without permission.')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'https://voucha.ai/discussion/park-photo' }),
    ).toBeVisible()
    expect(screen.getByText(/Poster 1: sent/)).toBeVisible()
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
})
