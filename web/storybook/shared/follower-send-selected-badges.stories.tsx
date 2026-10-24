import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { FollowerSendSelectedBadges } from '@/components/shared/follower-send-selected-badges'
import { StoryFrame } from '@/storybook/story-frame'
import { publicUsers } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'Shared/Follower Send Selected Badges',
  component: FollowerSendSelectedBadges,
  args: { followers: publicUsers.slice(0, 2), onToggleFollowerSelection: fn() },
  render: args => (
    <StoryFrame width='max-w-md'>
      <FollowerSendSelectedBadges {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof FollowerSendSelectedBadges>

export default meta
type Story = StoryObj<typeof meta>

export const TwoSelected: Story = {}

export const NoneSelected: Story = { args: { followers: [] } }
