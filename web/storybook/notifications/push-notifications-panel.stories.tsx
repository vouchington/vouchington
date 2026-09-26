import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PushNotificationsPanel } from '@/components/notifications/push-notifications-panel'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Notifications/Push Notifications Panel',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Disabled: Story = {
  render: () => (
    <StoryFrame>
      <PushNotificationsPanel
        currentSubscriptionId={undefined}
        pushEnabled={false}
        pushStatus='idle'
        onDisablePush={() => {}}
        onEnablePush={() => {}}
      />
    </StoryFrame>
  ),
}

export const Enabled: Story = {
  render: () => (
    <StoryFrame>
      <PushNotificationsPanel
        currentSubscriptionId='019f38fe-0000-7000-8000-0000000000w1'
        pushEnabled
        pushStatus='idle'
        onDisablePush={() => {}}
        onEnablePush={() => {}}
      />
    </StoryFrame>
  ),
}
