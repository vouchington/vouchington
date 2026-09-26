import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostCardTitle } from '@/components/posts/post-card/post-card-title'
import { StoryFrame } from '@/storybook/story-frame'
import { discussionPost, reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Post Card Title',
  component: PostCardTitle,
} satisfies Meta

export default meta
type Story = StoryObj

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardTitle
        post={reviewPost}
        routePath='review'
        view='card'
        shareable={false}
      />
    </StoryFrame>
  ),
}

export const UntitledDiscussion: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardTitle
        ownerUserId={discussionPost.created_by_id}
        post={{ ...discussionPost, title: '' }}
        routePath='discussion'
        view='compact'
        shareable
      />
    </StoryFrame>
  ),
}
