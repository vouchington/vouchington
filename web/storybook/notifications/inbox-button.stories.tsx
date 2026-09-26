import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { InboxButton } from '../../components/notifications/inbox-button'
import { clearInboxFixture, setInboxFixture } from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Notifications/Inbox Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  beforeEach: () => {
    setInboxFixture()
    return () => clearInboxFixture()
  },
  render: () => (
    <StoryFrame width='max-w-xs'>
      <InboxButton />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('1')).toBeVisible()
  },
}
