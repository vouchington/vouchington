import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import { CopyrightStaffQueueStatus } from './copyright-staff-queue-status'

function queueItem(assessed: boolean): CopyrightStaffQueueItem {
  return makeCopyrightStaffQueueItem({
    legal_holds: [
      {
        submission_id: 'hold-test',
        received_at: '2026-01-02T00:00:00Z',
        statement: { summary: 'Filed' },
        assessment: assessed
          ? {
              id: 'assessment-test',
              from_original_claimant: false,
              proceeding_kind: null,
              ccb_claim_kind: null,
              commenced_at: null,
              received_by_designated_agent_at: null,
              same_material: false,
              target_ids: [],
              qualifying: false,
              resolved: false,
            }
          : null,
      },
    ],
  })
}

describe('CopyrightStaffQueueStatus filing assessment', () => {
  it('marks an unassessed filing urgent with its assessment deadline', () => {
    render(<CopyrightStaffQueueStatus notice={queueItem(false)} />)
    expect(
      within(screen.getByRole('list', { name: 'Queue reasons' })).getByText(
        'Filing awaiting assessment',
      ),
    ).toBeVisible()
    expect(screen.getByText(/^Assess the filing by/)).toHaveTextContent(
      new Date('2026-01-14T00:00:00Z').toLocaleString(),
    )
  })
  it('does not mark an assessed filing urgent', () => {
    render(<CopyrightStaffQueueStatus notice={queueItem(true)} />)
    expect(
      within(screen.getByRole('list', { name: 'Queue reasons' })).getByText('Legal hold review'),
    ).toBeVisible()
    expect(screen.queryByText(/^Assess the filing by/)).not.toBeInTheDocument()
  })
  it('shows urgency without inventing a deadline when none is open', () => {
    render(<CopyrightStaffQueueStatus notice={{ ...queueItem(false), next_deadline: null }} />)
    expect(screen.getByText('Filing awaiting assessment')).toBeVisible()
    expect(screen.queryByText(/^Assess the filing by/)).not.toBeInTheDocument()
  })
})
