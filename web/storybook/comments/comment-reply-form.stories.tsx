import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentReplyForm } from '@/components/comments/comment-reply-form'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost, discussionPost } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Reply Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ReplyPreview() {
  return (
    <StoryFrame width='max-w-xl'>
      <CommentReplyForm
        parentId={commentPost.id}
        rootId={discussionPost.id}
        onSuccess={() => {}}
        onCancel={() => {}}
        showCancel
        initialMarkdown='The $300 travel credit covered a Sapphire Reserve lounge visit in September.'
      />
    </StoryFrame>
  )
}

export const Composing: Story = {
  render: () => <ReplyPreview />,
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <ReplyPreview />,
}
