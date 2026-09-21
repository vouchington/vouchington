import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CopyrightEmailApprovalFields } from './copyright-email-approval-fields'
import type { CopyrightEmailApprovalDraft } from './copyright-email-approval-model'

function draft(overrides: Partial<CopyrightEmailApprovalDraft> = {}): CopyrightEmailApprovalDraft {
  return {
    claimant_display_name: '',
    claimant_contact: '',
    claimant_email: '',
    work_description: '',
    electronic_signature: '',
    good_faith_belief: false,
    accuracy_authority_under_penalty_of_perjury: false,
    targets: [
      { id: 'target-1', post_id: '', image_id: '', target_url: '' },
      { id: 'target-2', post_id: '', image_id: '', target_url: '' },
    ],
    ...overrides,
  }
}

describe('CopyrightEmailApprovalFields', () => {
  it('edits statutory fields, removes a hosted image, and adds another', () => {
    const onChange = vi.fn<(next: CopyrightEmailApprovalDraft) => void>()
    const { rerender } = render(
      <CopyrightEmailApprovalFields
        draft={draft()}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Claimant name'), { target: { value: 'Claimant' } })
    fireEvent.change(screen.getByLabelText('Claimant contact information'), {
      target: { value: '1 Main St' },
    })
    fireEvent.change(screen.getByLabelText('Claimant email'), {
      target: { value: 'claimant@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Copyrighted work description'), {
      target: { value: 'A photograph' },
    })
    fireEvent.change(screen.getByLabelText('Electronic signature'), {
      target: { value: 'Claimant' },
    })
    fireEvent.change(screen.getByLabelText('Hosted use URL 1'), {
      target: { value: 'https://voucha.ai/discussion/one' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove hosted image' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Add hosted image' }))
    fireEvent.click(screen.getByLabelText(/good-faith belief/i))
    fireEvent.click(screen.getByLabelText(/under penalty of perjury/i))
    expect(onChange).toHaveBeenCalled()
    rerender(
      <CopyrightEmailApprovalFields
        draft={draft({ good_faith_belief: true })}
        onChange={onChange}
      />,
    )
    expect(screen.getByLabelText(/good-faith belief/i)).toBeChecked()
  })
})
