import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CopyrightEmailQueueItem } from '@/components/copyright/copyright-email-queue-item'
import { makeCopyrightEmailQueueItem } from '@/test-helpers/components/copyright/copyright-email-review'

const meta = {
  title: 'Copyright/Email Queue Item',
  component: CopyrightEmailQueueItem,
  decorators: [
    Story => (
      <ul>
        <Story />
      </ul>
    ),
  ],
  args: {
    item: makeCopyrightEmailQueueItem(),
    disabled: false,
    onSelect: fn(),
    resetQueue: fn(),
    setError: fn(),
    setSuccess: fn(),
  },
} satisfies Meta<typeof CopyrightEmailQueueItem>

export default meta
type Story = StoryObj<typeof meta>

export const AwaitingReview: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Initial intake/ }))
    await expect(args.onSelect).toHaveBeenCalledWith(args.item.id)
  },
}

export const ReplyBounced: Story = {
  args: {
    item: { ...makeCopyrightEmailQueueItem(), waiting_reason: 'reply_bounced' },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Reply to the sender bounced/)).toBeVisible()
  },
}

export const ReplyFailedWithRetry: Story = {
  args: {
    item: { ...makeCopyrightEmailQueueItem(), waiting_reason: 'reply_failed' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/could not be sent/)).toBeVisible()
  },
}

export const ParseFailed: Story = {
  args: {
    item: { ...makeCopyrightEmailQueueItem(), parse_status: 'failed' },
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Parse failed')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Initial intake/ })).toBeDisabled()
  },
}
