import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopyrightStaffQueue } from './copyright-staff-queue'

describe('CopyrightStaffQueue', () => {
  it('shows an empty review queue when no cases are waiting', () => {
    render(<CopyrightStaffQueue notices={[]} />)
    expect(screen.getByText('No copyright cases need review.')).toBeInTheDocument()
  })

  it('renders private case facts and every pending decision', () => {
    render(
      <CopyrightStaffQueue
        notices={[
          {
            id: 'case-123',
            jurisdiction: 'us_dmca',
            received_at: '2026-01-01T00:00:00.000Z',
            claimant: { display_name: 'Claimant', contact: 'claimant@example.test' },
            work_description: 'Original photograph.',
            targets: [
              {
                id: 'target-123',
                placement_key: 'image-placement:placement-123',
                placement_revision: 1,
                image_id: 'image-123',
                hosted_use_url: 'https://voucha.ai/posts/post-123',
              },
              {
                id: 'target-456',
                placement_key: 'image-placement:placement-456',
                placement_revision: 1,
                image_id: 'image-456',
                hosted_use_url: 'https://voucha.ai/posts/post-456',
              },
            ],
            evidence: [
              {
                id: 'evidence-123',
                submission_id: 'submission-123',
                mime_type: 'image/jpeg',
                byte_size: 123,
                sha256: 'a'.repeat(64),
              },
            ],
            form_review: {
              intake_id: 'intake-123',
              source_kind: 'guest_form',
              screening: { recommendation: 'invalid_or_spam', rationale: 'Needs review.' },
            },
            restrictions: [
              {
                id: 'restriction-123',
                target_id: 'target-123',
                imposed_at: '2026-01-02T00:00:00.000Z',
                status: 'pending_review',
              },
              {
                id: 'restriction-456',
                target_id: 'target-456',
                imposed_at: '2026-01-02T00:00:00.000Z',
                status: 'confirmed',
              },
            ],
            appeals: [
              {
                submission_id: 'appeal-123',
                reason: 'I own this image.',
                target_ids: ['target-123', 'target-456'],
                recommendation: {
                  id: 'recommendation-123',
                  recommendation: 'uncertain',
                  rationale: 'Needs a person.',
                },
              },
            ],
            counter_notices: [
              {
                submission_id: 'counter-123',
                received_at: '2026-01-03T00:00:00.000Z',
                target_ids: ['target-123'],
                statement: { name: 'Poster' },
              },
            ],
            legal_holds: [
              {
                submission_id: 'hold-123',
                received_at: '2026-01-03T00:00:00.000Z',
                statement: { case: 'example' },
                assessment: null,
              },
            ],
            action_intents: [],
            delivery_intents: [],
            email_correspondence: [],
          },
        ]}
      />,
    )
    expect(screen.getByText('Original photograph.')).toBeInTheDocument()
    expect(screen.getByText(/Claimant.*claimant@example\.test/)).toBeInTheDocument()
    expect(screen.getByText(/SHA-256/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve intake' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm restriction' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record target outcomes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Target 1 outcome')).toHaveTextContent('Keep restriction')
    expect(screen.getByLabelText('Target 2 outcome')).toHaveTextContent('Keep restriction')
    expect(screen.getByRole('checkbox', { name: /Target 1:/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Target 2:/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Accept counter-notice' })).toBeInTheDocument()
  })
})
