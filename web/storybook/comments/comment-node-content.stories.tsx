import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeContent } from '@/components/comments/comment-node-content'
import { StoryFrame } from '@/storybook/story-frame'
import { commentHtml, commentPost, deletedCommentPost } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Content',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ReviewNote: Story = {
  render: () => (
    <StoryFrame>
      <CommentNodeContent
        html={commentHtml}
        isDeleted={false}
        post={commentPost}
      />
    </StoryFrame>
  ),
}

export const Deleted: Story = {
  render: () => (
    <StoryFrame>
      <CommentNodeContent
        html={null}
        isDeleted
        post={deletedCommentPost}
      />
    </StoryFrame>
  ),
}
