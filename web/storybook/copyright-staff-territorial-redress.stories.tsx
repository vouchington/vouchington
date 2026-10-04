import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffTerritorialComplaintList } from '@/components/copyright/copyright-staff-territorial-complaint-list'
import type { CopyrightTerritorialComplaintsPage } from '@/lib/api/client/copyright-territorial-redress'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'

const complaints = [
  {
    id: 'complaint-1',
    filed_by: 'poster' as const,
    submitted_by_user_id: '019f0000-0000-7000-8000-000000000193',
    received_at: '2026-10-01T10:00:00Z',
    explanation: 'I have a license for this photograph.',
    informed_at: '2026-09-30T10:00:00Z',
    window_ends_at: '2027-03-30T10:00:00Z',
    decision: null,
  },
]

const item = makeCopyrightStaffQueueItem({
  id: '019f0000-0000-7000-8000-000000000192',
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
    recipients: [],
    decision: {
      id: 'decision-1',
      outcome: 'restrict',
      decided_at: '2026-09-30T10:00:00Z',
      rationale: 'The match is clear.',
      public_explanation: 'The image reproduces the photograph.',
    },
    reopened_at: null,
    complaints,
    complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    dispute_settlements: [],
    dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  },
})
const initialPage: CopyrightTerritorialComplaintsPage = {
  copyright_territorial_complaints: complaints,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const meta = {
  title: 'Copyright/Staff Territorial Complaint',
  component: CopyrightStaffTerritorialComplaintList,
  args: { item, initialPage, pending: false, onReview: () => undefined },
} satisfies Meta<typeof CopyrightStaffTerritorialComplaintList>

export default meta
type Story = StoryObj<typeof meta>

export const ReviewComplaint: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('I have a license for this photograph.')).toBeVisible()
    await expect(canvas.getByText(/Complaint deadline/)).toBeVisible()
    await expect(canvas.getByText(/voids its repeat-infringer incident/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Record Maintain decision' })).toBeDisabled()
  },
}
