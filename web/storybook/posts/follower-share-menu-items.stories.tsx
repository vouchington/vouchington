import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FollowerShareMenuItems } from '@/components/posts/follower-share-menu-items'
import { StoryFrame } from '@/storybook/story-frame'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Follower Share Menu Items',
  component: FollowerShareMenuItems,
} satisfies Meta

export default meta
type Story = StoryObj

export const Ready: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <FollowerShareMenuItems
          isSharePending={false}
          onShare={async () => {}}
          onSendOpen={() => {}}
        />
      </OpenPostMenu>
    </StoryFrame>
  ),
}
