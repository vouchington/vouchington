import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostCardContent } from '@/components/posts/post-card/post-card-content'
import { StoryFrame } from '@/storybook/story-frame'
import { discussionPost, htmlFor, reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Post Card Content',
  component: PostCardContent,
} satisfies Meta

export default meta
type Story = StoryObj

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardContent
        post={reviewPost}
        html={htmlFor(reviewPost)}
        contentLanguage='en'
        currentUserId={null}
        isStaff={false}
      />
    </StoryFrame>
  ),
}

export const Unavailable: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardContent
        post={{
          ...discussionPost,
          clearance_status: 'rejected',
          clearance_reason: 'Off-topic promotion',
        }}
        html={htmlFor(discussionPost)}
        contentLanguage='en'
        currentUserId={null}
        isStaff={false}
      />
    </StoryFrame>
  ),
}
