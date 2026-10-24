import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { InviteRedemption } from '@/components/communities/invite-redemption'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Invite Redemption',
  component: InviteRedemption,
} satisfies Meta<typeof InviteRedemption>

export default meta
type Story = StoryObj<typeof meta>

export const Invitation: Story = {
  args: { code: 'STORY1' },
  render: args => (
    <StoryFrame width='max-w-md'>
      <InviteRedemption {...args} />
    </StoryFrame>
  ),
}
