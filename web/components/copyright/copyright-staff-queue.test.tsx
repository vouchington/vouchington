import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightFormGuidance,
  CopyrightLegalHoldGuidance,
} from '@/types/copyright-notices'
import { CopyrightStaffQueue } from './copyright-staff-queue'

const guidance: CopyrightFormGuidance = {
  summary: 'Claims an unlicensed copy of a photograph.',
  elements: [
    { element: 'signature', status: 'present', gap: null },
    { element: 'work_identification', status: 'present', gap: null },
    { element: 'material_identification', status: 'present', gap: null },
    { element: 'contact_information', status: 'present', gap: null },
    { element: 'good_faith_statement', status: 'present', gap: null },
    { element: 'accuracy_authority_statement', status: 'present', gap: null },
  ],
  risk_notes: [],
  suggested_action: 'approve_intake',
}

const counterGuidance: CopyrightCounterNoticeGuidance = {
  summary: 'The counter-notice identifies the image.',
  elements: [
    { element: 'signature', status: 'present', gap: null },
    { element: 'material_identification', status: 'present', gap: null },
    { element: 'good_faith_statement', status: 'present', gap: null },
    { element: 'contact_and_jurisdiction_consent', status: 'present', gap: null },
  ],
  risk_notes: [],
}

const holdGuidance: CopyrightLegalHoldGuidance = {
  summary: 'The filing describes a court action.',
  criteria: [
    { criterion: 'from_original_claimant', status: 'unclear', gap: 'Check the sender.' },
    { criterion: 'proceeding_kind', status: 'present', gap: null },
    { criterion: 'commenced_at', status: 'present', gap: null },
    { criterion: 'received_by_designated_agent_at', status: 'unclear', gap: 'Check receipt.' },
    { criterion: 'same_material', status: 'present', gap: null },
  ],
  risk_notes: [],
}

describe('CopyrightStaffQueue', () => {
  it('shows an empty review queue when no cases are waiting', () => {
    render(
      <CopyrightStaffQueue
        data={{
          copyright_notices: [],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />,
    )
    expect(screen.getByText('No copyright cases need review.')).toBeInTheDocument()
  })

  it.each(['completed', 'pending', 'failed'] as const)(
    'renders private case facts and every pending decision with %s screening',
    state => {
      render(
        <CopyrightStaffQueue
          data={{
            copyright_notices: [
              {
                id: 'case-123',
                jurisdiction: 'us_dmca',
                received_at: '2026-01-01T00:00:00.000Z',
                claimant: {
                  display_name: 'Claimant',
                  contact: 'claimant@example.test',
                  misuse: {
                    notice_withdrawn: 1,
                    notice_rejected: 2,
                    restriction_reversed_by_counter_notice: 0,
                    restriction_reversed_by_appeal: 0,
                  },
                },
                work_description: 'Original photograph.',
                targets: [
                  {
                    id: 'target-123',
                    placement_key: 'image-placement:placement-123',
                    placement_revision: 1,
                    image_id: 'image-123',
                    surface: 'post-image',
                    provenance: null,
                    hosted_use_url: 'https://voucha.ai/posts/post-123',
                  },
                  {
                    id: 'target-456',
                    placement_key: 'image-placement:placement-456',
                    placement_revision: 1,
                    image_id: 'image-456',
                    surface: 'post-image',
                    provenance: null,
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
                  screening: {
                    state,
                    recommendation: state === 'completed' ? 'invalid_or_spam' : null,
                    rationale: state === 'completed' ? 'Needs review.' : null,
                    guidance: state === 'completed' ? guidance : null,
                  },
                  review: null,
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
                    guidance: state === 'completed' ? counterGuidance : null,
                  },
                ],
                legal_holds: [
                  {
                    submission_id: 'hold-123',
                    received_at: '2026-01-03T00:00:00.000Z',
                    statement: { case: 'example' },
                    guidance: state === 'completed' ? holdGuidance : null,
                    assessment: null,
                  },
                ],
                action_intents: [],
                delivery_intents: [],
                staydown_matches: [],
                email_correspondence: [],
                reasons: ['counter_notice_review', 'deadline_due', 'form_intake_review'],
                waiting_since: '2026-01-01T00:00:00.000Z',
                next_deadline: {
                  escalation_at: '2026-01-10T00:00:00.000Z',
                  restoration_deadline_at: '2026-01-15T00:00:00.000Z',
                },
              },
            ],
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }}
        />,
      )
      const reasons = within(screen.getByRole('list', { name: 'Queue reasons' }))
      expect(reasons.getAllByRole('listitem').map(item => item.textContent)).toEqual([
        'Counter-notice review',
        'Escalation due',
        'Intake review',
      ])
      expect(screen.getByText(/^Queued/).querySelector('time')).toHaveAttribute(
        'dateTime',
        '2026-01-01T00:00:00.000Z',
      )
      expect(screen.getByText(/^Next deadline/)).toHaveTextContent(
        `escalation ${new Date('2026-01-10T00:00:00.000Z').toLocaleString()} · restoration ${new Date('2026-01-15T00:00:00.000Z').toLocaleString()}`,
      )
      expect(screen.getByText('Original photograph.')).toBeInTheDocument()
      const screeningText =
        state === 'completed'
          ? 'Agent: invalid_or_spam. Needs review.'
          : `Screening ${state}. Moderator review required.`
      expect(screen.getByText(screeningText)).toBeInTheDocument()
      expect(screen.queryAllByText(/Agent: invalid_or_spam/)).toHaveLength(
        state === 'completed' ? 1 : 0,
      )
      expect(
        screen.queryAllByRole('region', { name: 'AI guidance — not a decision' }),
      ).toHaveLength(state === 'completed' ? 3 : 0)
      expect(screen.getByText(/Claimant.*claimant@example\.test/)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Notifier history' })).toBeInTheDocument()
      expect(screen.getByText('1 notice withdrawn by the notifier')).toBeInTheDocument()
      expect(screen.getByText('2 notices rejected on staff review')).toBeInTheDocument()
      expect(screen.queryByText(/restored after a counter-notice/)).not.toBeInTheDocument()
      expect(screen.getByText(/SHA-256/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Approve intake' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Confirm restriction' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Record target outcomes' })).toBeInTheDocument()
      expect(screen.getByLabelText('Target 1 outcome')).toHaveTextContent('Keep restriction')
      expect(screen.getByLabelText('Target 2 outcome')).toHaveTextContent('Keep restriction')
      expect(screen.getByRole('checkbox', { name: /Target 1:/ })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /Target 2:/ })).toBeChecked()
      expect(screen.getByRole('button', { name: 'Accept counter-notice' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Approve intake' }))
      fireEvent.change(screen.getByLabelText('Review rationale'), {
        target: { value: 'The intake is complete.' },
      })
    },
  )

  it.each([
    { accepted: true, reviewedById: 'moderator-123', decision: 'Approved by moderator-123' },
    { accepted: false, reviewedById: null, decision: 'Rejected by a deleted moderator account' },
  ])(
    'keeps the screening and AI guidance beside a recorded review ($decision) without offering the decision',
    ({ accepted, reviewedById, decision }) => {
      render(
        <CopyrightStaffQueue
          data={{
            copyright_notices: [
              {
                id: 'case-456',
                jurisdiction: 'us_dmca',
                received_at: '2026-01-01T00:00:00.000Z',
                claimant: {
                  display_name: 'Claimant',
                  contact: 'claimant@example.test',
                  misuse: null,
                },
                work_description: 'Original photograph.',
                targets: [],
                evidence: [],
                form_review: {
                  intake_id: 'intake-456',
                  source_kind: 'guest_form',
                  screening: {
                    state: 'completed',
                    recommendation: 'invalid_or_spam',
                    rationale: 'Needs review.',
                    guidance,
                  },
                  review: {
                    accepted,
                    reviewed_at: '2026-01-02T00:00:00.000Z',
                    reviewed_by_id: reviewedById,
                  },
                },
                restrictions: [],
                appeals: [],
                counter_notices: [],
                legal_holds: [],
                action_intents: [],
                delivery_intents: [],
                staydown_matches: [],
                email_correspondence: [],
                reasons: ['deadline_due'],
                waiting_since: '2026-01-05T00:00:00.000Z',
                next_deadline: {
                  escalation_at: '2026-01-05T00:00:00.000Z',
                  restoration_deadline_at: '2026-01-15T00:00:00.000Z',
                },
              },
            ],
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }}
        />,
      )
      expect(screen.getByRole('heading', { name: 'Form review recorded' })).toBeVisible()
      expect(screen.getByText(new RegExp(`^${decision} on `))).toBeVisible()
      expect(screen.getByText('Agent: invalid_or_spam. Needs review.')).toBeVisible()
      expect(screen.getByRole('region', { name: 'AI guidance — not a decision' })).toBeVisible()
      expect(screen.getByText('Claims an unlicensed copy of a photograph.')).toBeVisible()
      expect(screen.queryByText('Pending form review')).not.toBeInTheDocument()
      expect(screen.getByText('No account is linked to this notifier.')).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Approve intake' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reject intake' })).not.toBeInTheDocument()
    },
  )
})
