import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffTerritorial } from '@/components/copyright/copyright-staff-territorial'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'

const territorial = {
  notifier: { name: 'Mara Example', email: 'mara@example.test' },
  hosted_use_url: 'https://voucha.ai/discussion/park-photo',
  grounds: 'The post image reproduces my photograph without permission.',
  acknowledgment: {
    attempt_count: 1,
    last_attempt_at: '2026-09-29T10:00:00Z',
    acknowledged_at: null,
    exhausted_at: null,
    escalated: false,
  },
  decision: null,
  reopened_at: null,
  complaint_count: 1,
  dispute_settlement_count: 0,
}

const item = makeCopyrightStaffQueueItem({
  id: '019f0000-0000-7000-8000-000000000190',
  jurisdiction: 'eu_dsa',
  claimant: {
    user_id: null,
    display_name: 'Mara Example',
    contact: 'Mara, mara@example.test',
    misuse: null,
  },
  work_description: 'A landscape photograph from a public post.',
  reasons: ['territorial_notice_review'],
  territorial,
})

const meta = {
  title: 'Copyright/Staff Territorial Notice',
  component: CopyrightStaffTerritorial,
  args: { item, pending: false, onReview: () => undefined },
} satisfies Meta<typeof CopyrightStaffTerritorial>

export default meta
type Story = StoryObj<typeof meta>

export const UndecidedNotice: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('mara@example.test')).toBeVisible()
    await expect(canvas.getByRole('link', { name: /park-photo/ })).toBeVisible()
    await expect(canvas.getByText(/reproduces my photograph/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Record failed acknowledgment' })).toBeEnabled()
  },
}

export const DecisionAndCaseDetails: Story = {
  args: {
    item: {
      ...item,
      territorial: {
        ...territorial,
        decision: {
          id: '019f0000-0000-7000-8000-000000000197',
          outcome: 'restrict',
          decided_at: '2026-09-30T10:00:00Z',
          rationale: 'The image matches the described photograph.',
          public_explanation: 'The post image reproduces the protected photograph.',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Current decision: restrict')).toBeVisible()
    await expect(canvas.getByText(/Internal rationale:/)).toBeVisible()
    await expect(canvas.getByText('1 complaint, 0 dispute settlements.')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'View deliveries, complaints and settlements' }),
    ).toBeEnabled()
  },
}
