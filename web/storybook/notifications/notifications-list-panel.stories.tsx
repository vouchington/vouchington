import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { NotificationsListPanel } from '@/components/notifications/notifications-list-panel'
import { StoryFrame } from '@/storybook/story-frame'
import { notificationsFixture } from '@/storybook/notifications/notifications-fixture'

const meta = {
  title: 'Notifications/Notifications List Panel',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const baseProps = {
  endCursor: null,
  fetchError: null,
  hasNextPage: false,
  loadingMore: false,
  clearError: () => {},
  loadMore: async () => {},
  resetKey: 'notifications-story',
}

export const WithNotifications: Story = {
  render: () => {
    const onOpen = fn()
    const onDelete = fn()
    return (
      <StoryFrame width='max-w-xl'>
        <NotificationsListPanel
          {...baseProps}
          notifications={notificationsFixture}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      </StoryFrame>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      canvas.getByText('Alex Morgan replied to your Sapphire Reserve review'),
    ).toBeVisible()
    await expect(canvas.getByText('Alex Morgan followed you')).toBeVisible()
  },
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NotificationsListPanel
        {...baseProps}
        notifications={{ ...notificationsFixture, results: [], notifications: {} }}
        onOpen={() => {}}
        onDelete={() => {}}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No notifications yet')).toBeVisible()
  },
}
