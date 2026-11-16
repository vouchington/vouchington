import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import { CopyrightStaffQueueStatus } from './copyright-staff-queue-status'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'

function queueItem(assessed: boolean): CopyrightStaffQueueItem {
  return makeCopyrightStaffQueueItem({
    legal_holds: [
      {
        submission_id: 'hold-test',
        received_at: '2026-01-02T00:00:00Z',
        statement: { summary: 'Filed' },
        guidance: null,
        assessment: assessed
          ? {
              id: 'assessment-test',
              is_from_original_claimant: false,
              proceeding_kind: null,
              ccb_claim_kind: null,
              commenced_at: null,
              received_by_designated_agent_at: null,
              is_same_material: false,
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
      'Jan 14, 2026, 12:00 AM UTC',
    )
  })
  it.each([
    ['en', 'Jan 14, 2026, 12:00 AM UTC'],
    ['de', '14. Jan. 2026, 00:00 UTC'],
  ])('renders the assessment deadline in the %s UI locale', (locale, expected) => {
    render(
      <LocaleProvider locale={locale}>
        <CopyrightStaffQueueStatus notice={queueItem(false)} />
      </LocaleProvider>,
    )
    expect(screen.getByText(/^Assess the filing by/)).toHaveTextContent(expected)
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
