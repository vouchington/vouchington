import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffTerritorialDecision } from '@/components/copyright/copyright-staff-territorial-decision'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'

const undecided = makeCopyrightStaffQueueItem({
  id: 'notice-eu-example',
  jurisdiction: 'eu_dsa',
  reasons: ['territorial_notice_review'],
  territorial: {
    hosted_use_url: 'https://voucha.ai/discussion/photograph',
    grounds: 'A photograph in this post reproduces the notified work.',
    notifier: { name: 'Photo Rights', email: 'rights@example.test' },
    recipients: [],
    complaints: [],
    complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    dispute_settlements: [],
    dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    acknowledgment: {
      attempt_count: 1,
      last_attempt_at: '2026-10-04T10:00:00Z',
      acknowledged_at: '2026-10-04T10:01:00Z',
      exhausted_at: null,
      escalated: false,
    },
    reopened_at: null,
    decision: null,
  },
})

const meta = {
  title: 'Copyright/Staff Territorial Decision',
  component: CopyrightStaffTerritorialDecision,
  args: { item: undecided, pending: false, onReview: () => {} },
} satisfies Meta<typeof CopyrightStaffTerritorialDecision>

export default meta
type Story = StoryObj<typeof meta>

export const Undecided: Story = {}
export const Reopened: Story = {
  args: {
    item: {
      ...undecided,
      id: 'notice-uk-reopened',
      jurisdiction: 'uk',
      reasons: ['territorial_decision_reopened'],
      territorial: { ...undecided.territorial!, reopened_at: '2026-10-04T10:30:00Z' },
    },
  },
}
