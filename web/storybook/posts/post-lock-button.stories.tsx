import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostLockButton } from '@/components/posts/post-lock-button'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from './fixtures'

const meta = {
  title: 'Posts/Post Lock Button',
  component: PostLockButton,
} satisfies Meta<typeof PostLockButton>

export default meta
type Story = StoryObj<typeof meta>

export const Unlocked: Story = {
  args: { postIdOrSlug: reviewPost.slug ?? reviewPost.id, lockedAt: null },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <PostLockButton {...args} />
    </StoryFrame>
  ),
}
