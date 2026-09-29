import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopyrightStaffFormGuidance } from './copyright-staff-form-guidance'

describe('CopyrightStaffFormGuidance', () => {
  it('labels the checklist, gaps, and risks as advisory rather than a decision', () => {
    render(
      <CopyrightStaffFormGuidance
        guidance={{
          summary: 'Claims a copied product photo.',
          elements: [
            { element: 'signature', status: 'present', gap: null },
            { element: 'work_identification', status: 'unclear', gap: 'No original URL.' },
            { element: 'material_identification', status: 'present', gap: null },
            { element: 'contact_information', status: 'present', gap: null },
            { element: 'good_faith_statement', status: 'present', gap: null },
            { element: 'accuracy_authority_statement', status: 'missing', gap: 'Unchecked.' },
          ],
          risk_notes: [{ kind: 'possible_fair_use', note: 'Used in a product review.' }],
          suggested_action: 'request_information',
        }}
      />,
    )
    expect(screen.getByRole('region', { name: 'AI guidance — not a decision' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI guidance — not a decision' })).toBeVisible()
    expect(screen.getByText('Claims a copied product photo.')).toBeVisible()
    expect(screen.getByText('Identification of the work: unclear — No original URL.')).toBeVisible()
    expect(screen.getByText('Accuracy and authority statement: missing — Unchecked.')).toBeVisible()
    expect(screen.getByText('Possible fair use: Used in a product review.')).toBeVisible()
    expect(screen.getByText('Advisory suggestion: Request information')).toBeVisible()
  })
})
