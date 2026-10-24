import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { NotificationsPage } from '@/components/notifications/notifications-page'
import { StoryFrame } from '@/storybook/story-frame'
import { notificationsFixture } from '@/storybook/notifications/notifications-fixture'

const meta = {
  title: 'Notifications/Notifications Page',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const noMorePages = { has_next_page: false, end_cursor: null, start_cursor: null }

export const Inbox: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NotificationsPage
        initialNotifications={notificationsFixture}
        initialSubscriptions={{ results: [], page_info: noMorePages }}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      canvas.getByText('Alex Morgan replied to your Sapphire Reserve review'),
    ).toBeVisible()
  },
}

export const EmptyInbox: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NotificationsPage
        initialNotifications={{ ...notificationsFixture, results: [], notifications: {} }}
        initialSubscriptions={[]}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No notifications yet')).toBeVisible()
  },
}
