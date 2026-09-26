import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { InboxButton } from '../../components/notifications/inbox-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Notifications/Inbox Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  render: () => (
    <StoryFrame width='max-w-xs'>
      <InboxButton />
    </StoryFrame>
  ),
}
