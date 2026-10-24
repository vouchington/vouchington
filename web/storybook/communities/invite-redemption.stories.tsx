import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { InviteRedemption } from '@/components/communities/invite-redemption'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Invite Redemption',
  component: InviteRedemption,
  render: args => (
    <StoryFrame width='max-w-md'>
      <InviteRedemption {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof InviteRedemption>

export default meta
type Story = StoryObj<typeof meta>

export const ReadyToJoin: Story = {
  args: { code: 'STORY1' },
}
