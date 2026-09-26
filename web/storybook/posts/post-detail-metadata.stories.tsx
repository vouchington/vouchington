import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostDetailMetadata } from '@/components/posts/post-detail-metadata'
import { StoryFrame } from '@/storybook/story-frame'
import { alexUser, officialUser, reviewPost } from './fixtures'

const meta = {
  title: 'Posts/Post Detail Metadata',
  component: PostDetailMetadata,
} satisfies Meta

export default meta
type Story = StoryObj

export const Author: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostDetailMetadata
        authorName='Alex Morgan'
        author={alexUser}
        createdAt={reviewPost.created_at}
        bylineLabel='Posted by Alex Morgan'
        separatorLabel='•'
      />
    </StoryFrame>
  ),
}

export const OfficialAccount: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostDetailMetadata
        authorName='voucha-agent'
        author={officialUser}
        createdAt={reviewPost.created_at}
        bylineLabel='Posted by voucha-agent'
        separatorLabel='•'
      />
    </StoryFrame>
  ),
}
