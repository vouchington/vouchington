import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModerationTransparencyPanel } from '@/components/moderation/moderation-transparency-panel'
import type { ModerationTransparency } from '@/types/moderation-analytics'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/Moderation Transparency Panel',
  component: ModerationTransparencyPanel,
} satisfies Meta<typeof ModerationTransparencyPanel>

export default meta
type Story = StoryObj<typeof meta>

const transparency: ModerationTransparency = {
  range: '30d',
  buckets: [
    { date: '2026-05-01', metric: 'automated_moderation', category: 'community_ai', count: 25 },
    { date: '2026-05-02', metric: 'reports', category: 'user_report', count: 12 },
  ],
}

export const ReleasedCounts: Story = {
  args: { transparency },
  render: args => (
    <StoryFrame>
      <ModerationTransparencyPanel {...args} />
    </StoryFrame>
  ),
}

export const UpgradeRequired: Story = {
  args: { transparency: null },
  render: args => (
    <StoryFrame>
      <ModerationTransparencyPanel {...args} />
    </StoryFrame>
  ),
}
