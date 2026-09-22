import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  assessCopyrightLegalHold,
  resolveCopyrightLegalHold,
} from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffLegalHoldReview } from './copyright-staff-case-legal-hold'
import type { SubmitReview } from './copyright-staff-review-buttons'

vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  assessCopyrightLegalHold: vi.fn<typeof assessCopyrightLegalHold>(),
  resolveCopyrightLegalHold: vi.fn<typeof resolveCopyrightLegalHold>(),
}))

const mockAssessLegalHold = vi.mocked(assessCopyrightLegalHold)
const submit: SubmitReview = action => {
  void action()
}

const targets: CopyrightStaffQueueItem['targets'] = [
  {
    id: 'target-1',
    placement_key: 'image-placement:one',
    placement_revision: 1,
    image_id: 'image-1',
    hosted_use_url: 'https://voucha.ai/discussion/one',
  },
]

const hold: CopyrightStaffQueueItem['legal_holds'][number] = {
  submission_id: 'hold-1',
  received_at: '2026-09-01T00:00:00.000Z',
  statement: { filing: 'example' },
  assessment: null,
}

describe('CopyrightStaffLegalHoldReview', () => {
  it('clears hidden proceeding facts before recording no qualifying proceeding', async () => {
    mockAssessLegalHold.mockResolvedValue(undefined)
    render(
      <CopyrightStaffLegalHoldReview
        hold={hold}
        pending={false}
        rationale='The filing is not qualifying.'
        submit={submit}
        targets={targets}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Proceeding' }))
    fireEvent.click(screen.getByRole('option', { name: 'Copyright Claims Board' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'CCB filing kind' }))
    fireEvent.click(screen.getByRole('option', { name: 'Counterclaim' }))
    fireEvent.change(screen.getByLabelText('Proceeding commenced'), {
      target: { value: '2026-09-01T12:00' },
    })
    fireEvent.change(screen.getByLabelText('Designated agent received proof'), {
      target: { value: '2026-09-01T12:30' },
    })
    fireEvent.click(screen.getByRole('combobox', { name: 'Proceeding' }))
    fireEvent.click(screen.getByRole('option', { name: 'No qualifying proceeding' }))

    expect(screen.queryByLabelText('Proceeding commenced')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record assessment' }))

    await waitFor(() => {
      expect(mockAssessLegalHold).toHaveBeenCalledWith('hold-1', {
        rationale: 'The filing is not qualifying.',
        from_original_claimant: false,
        proceeding_kind: null,
        ccb_claim_kind: null,
        commenced_at: null,
        received_by_designated_agent_at: null,
        same_material: false,
        target_ids: ['target-1'],
      })
    })
  })

  it.each(['Federal court', 'Copyright Claims Board'])(
    'requires dates for %s proceedings',
    proceeding => {
      render(
        <CopyrightStaffLegalHoldReview
          hold={hold}
          pending={false}
          rationale='The filing qualifies.'
          submit={submit}
          targets={targets}
        />,
      )
      fireEvent.click(screen.getByRole('combobox', { name: 'Proceeding' }))
      fireEvent.click(screen.getByRole('option', { name: proceeding }))

      expect(screen.getByRole('button', { name: 'Record assessment' })).toBeDisabled()
    },
  )
})
