import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PushNotificationsPanel } from '@/components/notifications/push-notifications-panel'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Notifications/Push Notifications Panel',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Panel({ enabled: initialEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  return (
    <PushNotificationsPanel
      currentSubscriptionId={enabled ? '019f38fe-0000-7000-8000-0000000000w1' : undefined}
      pushEnabled={enabled}
      pushStatus='idle'
      onDisablePush={() => setEnabled(false)}
      onEnablePush={() => setEnabled(true)}
    />
  )
}

export const Disabled: Story = {
  render: () => (
    <StoryFrame>
      <Panel enabled={false} />
    </StoryFrame>
  ),
}

export const Enabled: Story = {
  render: () => (
    <StoryFrame>
      <Panel enabled />
    </StoryFrame>
  ),
}
