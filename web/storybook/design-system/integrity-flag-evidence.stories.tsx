import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { IntegrityFlagEvidence } from '@/components/admin/integrity-flag-evidence'

const meta = {
  title: 'Design System/Components/Integrity Flag Evidence',
  component: IntegrityFlagEvidence,
} satisfies Meta<typeof IntegrityFlagEvidence>

export default meta
type Story = StoryObj<typeof meta>

export const MassReports: Story = {
  args: {
    domain: 'report',
    flagType: 'mass_report_suspected',
    details: {
      reporter_count: 12,
      new_account_reporter_count: 9,
      threshold: 10,
      window_minutes: 60,
      new_account_age_days: 7,
      reporter_user_ids: ['019f7000-0000-7000-8000-000000000101'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New account reporters: 9')).toBeVisible()
    await expect(canvas.queryByText(/019f7000/)).toBeNull()
  },
}

export const VoteVelocity: Story = {
  args: {
    domain: 'vote',
    flagType: 'velocity_spike',
    details: {
      young_account_vote_count: 18,
      threshold: 10,
      window_minutes: 30,
      young_account_age_days: 14,
    },
  },
}

export const IpCorrelation: Story = {
  args: {
    domain: 'vote',
    flagType: 'ip_correlation',
    details: {
      correlated_ips: [
        { ip_address: '192.0.2.10', distinct_user_count: 5 },
        { ip_address: '192.0.2.11', distinct_user_count: 4 },
      ],
      threshold: 3,
      window_minutes: 15,
    },
  },
}
