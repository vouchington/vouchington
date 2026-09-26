import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { CommentReplyForm } from '@/components/comments/comment-reply-form'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost, discussionPost } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Reply Form',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ReplyPreview() {
  const [posted, setPosted] = useState(false)
  return (
    <StoryFrame width='max-w-xl'>
      <CommentReplyForm
        parentId={commentPost.id}
        rootId={discussionPost.id}
        onSuccess={() => setPosted(true)}
        onCancel={() => {}}
        showCancel
        initialMarkdown='The $300 travel credit covered a Sapphire Reserve lounge visit in September.'
      />
      {posted ? <p className='mt-3 text-sm'>Comment posted</p> : null}
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
