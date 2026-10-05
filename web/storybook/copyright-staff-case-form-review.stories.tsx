import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffFormReview } from '@/components/copyright/copyright-staff-case-form-review'
import type { CopyrightFormGuidance } from '@/types/copyright-notices'

const guidance: CopyrightFormGuidance = {
  summary:
    'Claims a travel blog reused the claimant’s airport lounge photograph without a license.',
  elements: [
    { element: 'signature', status: 'present', gap: null },
    { element: 'work_identification', status: 'present', gap: null },
    {
      element: 'material_identification',
      status: 'unclear',
      gap: 'The hosted URL points to a post with several images; the image is not named.',
    },
    { element: 'contact_information', status: 'present', gap: null },
    { element: 'has_good_faith_statement', status: 'present', gap: null },
    { element: 'accuracy_authority_statement', status: 'present', gap: null },
  ],
  risk_notes: [
    { kind: 'possible_fair_use', note: 'The image appears in a critical review of the lounge.' },
  ],
  suggested_action: 'request_information',
}

const screening = {
  state: 'completed',
  recommendation: 'not_obviously_invalid',
  rationale: 'No obvious spam markers.',
  guidance,
} as const

const meta = {
  title: 'Copyright/Staff Form Review',
  component: CopyrightStaffFormReview,
  args: {
    canSubmit: true,
    pending: false,
    rationale: 'The signed notice is complete.',
    submit: () => undefined,
  },
} satisfies Meta<typeof CopyrightStaffFormReview>

export default meta
type Story = StoryObj<typeof meta>

export const Unreviewed: Story = {
  args: {
    formReview: { intake_id: 'intake-1', source_kind: 'guest_form', screening, review: null },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Approve intake' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Reject intake' })).toBeVisible()
  },
}

/** Guidance and the recorded decision stay visible; the decision is no longer offered. */
export const ReviewedApproved: Story = {
  args: {
    formReview: {
      intake_id: 'intake-1',
      source_kind: 'guest_form',
      screening,
      review: {
        is_accepted: true,
        reviewed_at: '2026-07-01T11:30:00.000Z',
        reviewed_by_id: '00000000-0000-7000-8000-000000000817',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Form review recorded' })).toBeVisible()
    await expect(canvas.getByRole('region', { name: 'AI guidance — not a decision' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Approve intake' })).toBeNull()
  },
}

export const ReviewedRejectedByDeletedModerator: Story = {
  args: {
    formReview: {
      intake_id: 'intake-2',
      source_kind: 'signed_in_form',
      screening,
      review: { is_accepted: false, reviewed_at: '2026-07-01T11:30:00.000Z', reviewed_by_id: null },
    },
  },
}
