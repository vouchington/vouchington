import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
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
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'Open inbox, 1 unread' })

    await expect(button).toHaveAttribute('data-pw', 'inbox-open-button')
    await expect(canvas.getByText('1')).toBeVisible()

    await userEvent.hover(button)
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole('tooltip', { name: 'Inbox' }),
    ).toBeVisible()
  },
}
