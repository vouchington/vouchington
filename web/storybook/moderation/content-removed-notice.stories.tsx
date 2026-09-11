import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContentRemovedNotice } from '@/components/moderation/notices/content-removed-notice'

const meta: Meta<typeof ContentRemovedNotice> = {
  component: ContentRemovedNotice,
  title: 'Moderation/ContentRemovedNotice',
}
export default meta

type Story = StoryObj<typeof ContentRemovedNotice>

export const Default: Story = {}

export const WithReason: Story = {
  args: {
    reason: 'This post violates our community guidelines on misinformation.',
  },
}
