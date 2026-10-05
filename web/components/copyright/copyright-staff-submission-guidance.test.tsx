import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopyrightStaffSubmissionGuidance } from './copyright-staff-submission-guidance'

describe('CopyrightStaffSubmissionGuidance', () => {
  it('shows a counter-notice checklist and risk without making a decision', () => {
    render(
      <CopyrightStaffSubmissionGuidance
        kind='counter_notice'
        guidance={{
          summary: 'The filing identifies the restricted image.',
          elements: [
            { element: 'signature', status: 'present', gap: null },
            { element: 'material_identification', status: 'unclear', gap: 'Compare the image ID.' },
            { element: 'has_good_faith_statement', status: 'present', gap: null },
            { element: 'contact_and_jurisdiction_consent', status: 'present', gap: null },
          ],
          risk_notes: [{ kind: 'material_mismatch', note: 'The image IDs may differ.' }],
        }}
      />,
    )
    const region = screen.getByRole('region', { name: 'AI guidance — not a decision' })
    expect(within(region).getByText('The filing identifies the restricted image.')).toBeVisible()
    expect(
      within(region).getByText('Identification of the material: unclear. Compare the image ID.'),
    ).toBeVisible()
    expect(within(region).getByText('Material mismatch: The image IDs may differ.')).toBeVisible()
    expect(within(region).queryByText(/suggested action/i)).not.toBeInTheDocument()
  })

  it('shows filing criteria, including an unresolved agent-receipt date', () => {
    render(
      <CopyrightStaffSubmissionGuidance
        kind='court_or_ccb_hold'
        guidance={{
          summary: 'The filing names a proceeding.',
          criteria: [
            { criterion: 'is_from_original_claimant', status: 'unclear', gap: 'Check the sender.' },
            { criterion: 'proceeding_kind', status: 'present', gap: null },
            { criterion: 'commenced_at', status: 'present', gap: null },
            {
              criterion: 'received_by_designated_agent_at',
              status: 'missing',
              gap: 'No receipt date is given.',
            },
            { criterion: 'is_same_material', status: 'unclear', gap: 'Compare the images.' },
          ],
          risk_notes: [{ kind: 'timing_gap', note: 'Check when the agent received proof.' }],
        }}
      />,
    )
    const region = screen.getByRole('region', { name: 'AI guidance — not a decision' })
    expect(
      within(region).getByText(
        'Designated agent received proof: missing. No receipt date is given.',
      ),
    ).toBeVisible()
    expect(
      within(region).getByText('Timing gap: Check when the agent received proof.'),
    ).toBeVisible()
    expect(within(region).queryByText(/suggested action/i)).not.toBeInTheDocument()
  })
})
