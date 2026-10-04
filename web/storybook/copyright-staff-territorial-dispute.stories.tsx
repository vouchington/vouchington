import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffTerritorialDispute } from '@/components/copyright/copyright-staff-territorial-dispute'
import type { CopyrightEuDisputeSettlementsPage } from '@/lib/api/client/copyright-territorial-redress'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'

const item = makeCopyrightStaffQueueItem({
  id: '019f0000-0000-7000-8000-000000000194',
  jurisdiction: 'eu_dsa',
  territorial: {
    notifier: { name: 'Mara Example', email: 'mara@example.test' },
    hosted_use_url: 'https://voucha.ai/discussion/park-photo',
    grounds: 'The post image reproduces my photograph.',
    acknowledgment: {
      attempt_count: 1,
      last_attempt_at: '2026-09-29T10:00:00Z',
      acknowledged_at: '2026-09-29T10:01:00Z',
      exhausted_at: null,
      escalated: false,
    },
    recipients: [
      {
        role: 'claimant',
        user_id: '019f0000-0000-7000-8000-000000000195',
        informed_at: '2026-09-30T10:00:00Z',
        state: 'sent',
      },
    ],
    decision: {
      id: 'decision-1',
      outcome: 'restrict',
      decided_at: '2026-09-30T10:00:00Z',
      rationale: 'The match is clear.',
      public_explanation: 'The image reproduces the photograph.',
    },
    reopened_at: null,
    complaints: [],
    complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    dispute_settlements: [
      {
        id: 'referral-1',
        body_name: 'Example Dispute Body',
        referred_at: '2026-10-01T10:00:00Z',
        referred_by_party: 'poster',
        referred_by_user_id: '019f0000-0000-7000-8000-000000000196',
        outcome: null,
      },
    ],
    dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  },
})
const initialPage: CopyrightEuDisputeSettlementsPage = {
  copyright_eu_dispute_settlements: item.territorial?.dispute_settlements ?? [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const meta = {
  title: 'Copyright/Staff Territorial Dispute Settlement',
  component: CopyrightStaffTerritorialDispute,
  args: { item, initialPage, pending: false, onReview: () => undefined },
} satisfies Meta<typeof CopyrightStaffTerritorialDispute>

export default meta
type Story = StoryObj<typeof meta>

export const RecordOutcome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Example Dispute Body')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Record outcome' })).toBeEnabled()
    await expect(canvas.getByText(/does not bind Voucha/)).toBeVisible()
  },
}
