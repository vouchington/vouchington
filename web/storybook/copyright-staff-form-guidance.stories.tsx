import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffFormGuidance } from '@/components/copyright/copyright-staff-form-guidance'

const meta = {
  title: 'Copyright/Staff Form Guidance',
  component: CopyrightStaffFormGuidance,
} satisfies Meta<typeof CopyrightStaffFormGuidance>

export default meta
type Story = StoryObj<typeof meta>

export const WithGapsAndRisks: Story = {
  args: {
    guidance: {
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
        { element: 'good_faith_statement', status: 'present', gap: null },
        {
          element: 'accuracy_authority_statement',
          status: 'missing',
          gap: 'The statement under penalty of perjury was not affirmed.',
        },
      ],
      risk_notes: [
        {
          kind: 'possible_fair_use',
          note: 'The image appears in a critical review of the lounge.',
        },
        {
          kind: 'mismatched_claimant',
          note: 'The display name differs from the credited photographer.',
        },
      ],
      suggested_action: 'request_information',
    },
  },
}

export const CompleteNotice: Story = {
  args: {
    guidance: {
      summary: 'Claims a card-benefits post copied the claimant’s original comparison chart.',
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
    },
  },
}
