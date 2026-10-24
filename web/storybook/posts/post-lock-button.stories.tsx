import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostLockButton } from '@/components/posts/post-lock-button'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from './fixtures'

const meta = {
  title: 'Posts/Post Lock Button',
  component: PostLockButton,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof PostLockButton>

export default meta
type Story = StoryObj<typeof meta>

const postIdOrSlug = reviewPost.slug ?? reviewPost.id

export const Unlocked: Story = {
  args: { postIdOrSlug, lockedAt: null },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <PostLockButton {...args} />
    </StoryFrame>
  ),
}

export const Locked: Story = {
  args: { postIdOrSlug, lockedAt: reviewPost.updated_at },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <PostLockButton {...args} />
    </StoryFrame>
  ),
}
