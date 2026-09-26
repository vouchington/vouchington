import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ExposureCooldownGate } from '@/components/moderation/exposure-cooldown-gate'
import type { UseExposureCooldownReturn } from '@/components/moderation/use-exposure-cooldown'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/Exposure Cooldown Gate',
  component: ExposureCooldownGate,
} satisfies Meta<typeof ExposureCooldownGate>

export default meta
type Story = StoryObj<typeof meta>

const queue = (
  <p>Credit Cards still has three open reports about Sapphire Reserve referral posts.</p>
)

const baseCooldown: UseExposureCooldownReturn = {
  exposureState: {
    count: 3,
    threshold: 8,
    in_cooldown: false,
    cooldown_ends_at: null,
  },
  exposureStateIsStale: false,
  revealBlocked: false,
  recordReveal: () => {},
  refreshExposureState: async () => {},
  dismissBreakPrompt: () => {},
  showBreakPrompt: false,
}

export const QueueOpen: Story = {
  args: { children: queue, cooldown: baseCooldown },
  render: args => (
    <StoryFrame>
      <ExposureCooldownGate {...args} />
    </StoryFrame>
  ),
}

export const BreakPrompt: Story = {
  args: {
    children: queue,
    cooldown: {
      ...baseCooldown,
      exposureState: {
        count: 8,
        threshold: 8,
        in_cooldown: true,
        cooldown_ends_at: '2099-01-01T00:00:00.000Z',
      },
      revealBlocked: true,
      showBreakPrompt: true,
    },
  },
  render: args => (
    <StoryFrame>
      <ExposureCooldownGate {...args} />
    </StoryFrame>
  ),
}
