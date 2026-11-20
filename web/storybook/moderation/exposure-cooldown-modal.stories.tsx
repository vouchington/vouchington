import { useState } from 'react'
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
    count: 10,
    countCapped: false,
    onDismiss: () => {},
  },
  render: args => (
    <StoryFrame>
      <ExposureCooldownModal {...args} />
    </StoryFrame>
  ),
}

function ReadyToContinueModal({
  cooldownEndsAt,
  count,
  countCapped,
}: {
  cooldownEndsAt: string
  count: number
  countCapped: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <ExposureCooldownModal
      open={open}
      cooldownEndsAt={cooldownEndsAt}
      count={count}
      countCapped={countCapped}
      onDismiss={() => setOpen(false)}
    />
  )
}

export const ReadyToContinue: Story = {
  args: {
    open: true,
    cooldownEndsAt: '2020-01-01T00:00:00.000Z',
    count: 99,
    countCapped: true,
    onDismiss: () => {},
  },
  render: args => (
    <StoryFrame>
      <ReadyToContinueModal
        cooldownEndsAt={args.cooldownEndsAt ?? '2020-01-01T00:00:00.000Z'}
        count={args.count}
        countCapped={args.countCapped}
      />
    </StoryFrame>
  ),
}
