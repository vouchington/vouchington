import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'
import { CopyrightEmailCorrespondenceFields } from './copyright-email-correspondence-fields'
import type { CopyrightEmailCorrespondenceDraft } from './copyright-email-correspondence-model'

const detail = {
  id: 'intake-1',
  linked_notice: {
    id: 'notice-1',
    targets: [{ id: 'target-1', placement_key: 'image-placement:one' }],
  },
} as CopyrightEmailIntake

function draft(
  overrides: Partial<CopyrightEmailCorrespondenceDraft> = {},
): CopyrightEmailCorrespondenceDraft {
  return {
    kind: 'supplement',
    appeal_reason: '',
    name: '',
    address: '',
    telephone: '',
    electronic_signature: '',
    consent_to_federal_jurisdiction: false,
    consent_to_service_of_process: false,
    good_faith_misidentification_under_penalty_of_perjury: false,
    submission_summary: '',
    target_ids: [],
    ...overrides,
  }
}

describe('CopyrightEmailCorrespondenceFields', () => {
  it('edits supplement, appeal, and counter-notice classification fields', () => {
    const onChange = vi.fn<(next: CopyrightEmailCorrespondenceDraft) => void>()
    const { rerender } = render(
      <CopyrightEmailCorrespondenceFields
        detail={detail}
        draft={draft()}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Correspondence summary'), {
      target: { value: 'Additional facts.' },
    })
    rerender(
      <CopyrightEmailCorrespondenceFields
        detail={detail}
        draft={draft({ kind: 'appeal', target_ids: [] })}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Appeal reason'), {
      target: { value: 'This is my work.' },
    })
    fireEvent.click(screen.getByText('image-placement:one'))
    rerender(
      <CopyrightEmailCorrespondenceFields
        detail={detail}
        draft={draft({ kind: 'counter_notice', target_ids: ['target-1'] })}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Counter-notice name'), { target: { value: 'Poster' } })
    fireEvent.change(screen.getByLabelText('Counter-notice address'), {
      target: { value: '1 Main St' },
    })
    fireEvent.change(screen.getByLabelText('Counter-notice telephone'), {
      target: { value: '555-0100' },
    })
    fireEvent.change(screen.getByLabelText('Counter-notice electronic signature'), {
      target: { value: 'Poster' },
    })
    fireEvent.click(screen.getByLabelText('Consent to federal jurisdiction'))
    fireEvent.click(screen.getByLabelText('Consent to service of process'))
    fireEvent.click(
      screen.getByLabelText('Good-faith misidentification statement under penalty of perjury'),
    )
    fireEvent.click(screen.getByText('image-placement:one'))
    expect(onChange).toHaveBeenCalled()
  })
})
