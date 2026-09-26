import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ExposureCooldownModal } from '@/components/moderation/exposure-cooldown-modal'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/Exposure Cooldown Modal',
  component: ExposureCooldownModal,
} satisfies Meta<typeof ExposureCooldownModal>

export default meta
type Story = StoryObj<typeof meta>

export const Waiting: Story = {
  args: {
    open: true,
    cooldownEndsAt: '2099-01-01T00:00:00.000Z',
    onDismiss: () => {},
  },
  render: args => (
    <StoryFrame>
      <ExposureCooldownModal {...args} />
    </StoryFrame>
  ),
}

export const ReadyToContinue: Story = {
  args: {
    open: true,
    cooldownEndsAt: '2020-01-01T00:00:00.000Z',
    onDismiss: () => {},
  },
  render: args => (
    <StoryFrame>
      <ExposureCooldownModal {...args} />
    </StoryFrame>
  ),
}
