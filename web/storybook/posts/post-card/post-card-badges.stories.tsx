import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostCardBadges } from '@/components/posts/post-card/post-card-badges'
import { StoryFrame } from '@/storybook/story-frame'
import { creditCardCommunity, discussionPost, reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Post Card Badges',
  component: PostCardBadges,
} satisfies Meta

export default meta
type Story = StoryObj

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardBadges post={reviewPost} />
    </StoryFrame>
  ),
}

export const Discussion: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardBadges
        post={discussionPost}
        community={creditCardCommunity}
      />
    </StoryFrame>
  ),
}
