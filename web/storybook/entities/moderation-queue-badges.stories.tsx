import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  ModerationSlaBadge,
  ReportCountBadge,
} from '@/components/moderation/moderation-queue-badges'

const meta = {
  title: 'Entities/Moderation/QueueBadges',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const freshCreatedAt = '2026-06-05T17:40:00.000Z'
const dueCreatedAt = '2026-06-05T15:00:00.000Z'
const lateCreatedAt = '2026-06-04T12:00:00.000Z'

export const States: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-3xl flex-wrap gap-3 rounded-md border p-3'>
        <ModerationSlaBadge createdAt={freshCreatedAt} />
        <ModerationSlaBadge createdAt={dueCreatedAt} />
        <ModerationSlaBadge createdAt={lateCreatedAt} />
        <ReportCountBadge count={1} />
        <ReportCountBadge count={4} />
      </div>
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('1 report')).toBeVisible()
    await expect(canvas.getByText('4 reports')).toBeVisible()
    await expect(canvasElement.querySelectorAll('[data-pw="moderation-sla-badge"]')).toHaveLength(3)
  },
}
