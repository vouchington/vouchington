import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffSubmissionGuidance } from '@/components/copyright/copyright-staff-submission-guidance'

const meta = {
  title: 'Copyright/Staff Submission Guidance',
  component: CopyrightStaffSubmissionGuidance,
} satisfies Meta<typeof CopyrightStaffSubmissionGuidance>

export default meta
type Story = StoryObj<typeof meta>

export const CounterNotice: Story = {
  args: {
    kind: 'counter_notice',
    guidance: {
      summary: 'The filed counter-notice identifies one image and disputes the restriction.',
      elements: [
        { element: 'signature', status: 'present', gap: null },
        { element: 'material_identification', status: 'present', gap: null },
        { element: 'good_faith_statement', status: 'present', gap: null },
        { element: 'contact_and_jurisdiction_consent', status: 'present', gap: null },
      ],
      risk_notes: [
        {
          kind: 'material_mismatch',
          note: 'Compare the identified image with the image named in the notice.',
        },
      ],
    },
  },
}

export const CourtFiling: Story = {
  args: {
    kind: 'court_or_ccb_hold',
    guidance: {
      summary: 'The filing describes a federal court action about the disputed image.',
      criteria: [
        { criterion: 'from_original_claimant', status: 'unclear', gap: 'Confirm the sender.' },
        { criterion: 'proceeding_kind', status: 'present', gap: null },
        { criterion: 'commenced_at', status: 'present', gap: null },
        {
          criterion: 'received_by_designated_agent_at',
          status: 'missing',
          gap: 'No receipt time is stated.',
        },
        { criterion: 'same_material', status: 'unclear', gap: 'Compare the filed image.' },
      ],
      risk_notes: [
        { kind: 'timing_gap', note: 'Check when the designated agent received the filing.' },
      ],
    },
  },
}
