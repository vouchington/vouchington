import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostLockMenuItem } from '@/components/posts/post-lock-menu-item'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from './fixtures'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Post Lock Menu Item',
  component: PostLockMenuItem,
} satisfies Meta

export default meta
type Story = StoryObj

const postIdOrSlug = reviewPost.slug ?? reviewPost.id

export const Unlocked: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <PostLockMenuItem
          postIdOrSlug={postIdOrSlug}
          lockedAt={null}
        />
      </OpenPostMenu>
    </StoryFrame>
  ),
}

export const Locked: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <PostLockMenuItem
          postIdOrSlug={postIdOrSlug}
          lockedAt={reviewPost.updated_at}
        />
      </OpenPostMenu>
    </StoryFrame>
  ),
}
