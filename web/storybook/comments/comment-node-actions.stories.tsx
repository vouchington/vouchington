import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeActions } from '@/components/comments/comment-node-actions'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { commentAuthor, commentNode, commentPermalink } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Actions',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ActionsPreview() {
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [quotedTitle, setQuotedTitle] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleted, setDeleted] = useState(false)
  if (deleted) {
    return (
      <StoryFrame>
        <p>Comment deleted</p>
      </StoryFrame>
    )
  }
  return (
    <StoryFrame>
      {replyToId ? <p>Replying to comment</p> : null}
      {quotedTitle ? <p>Quoting {quotedTitle}</p> : null}
      {editing ? <p>Editing comment</p> : null}
      <CommentNodeActions
        hideDownCount={false}
        isAdmin={false}
        node={commentNode}
        onQuote={post => setQuotedTitle(post.title)}
        onToggleReply={setReplyToId}
        onStartEdit={() => setEditing(true)}
        onDeleted={() => setDeleted(true)}
        permalink={commentPermalink}
        replyToId={replyToId}
        isThreadLocked={false}
      />
    </StoryFrame>
  )
}

export const Author: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <ActionsPreview />,
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <ActionsPreview />,
}
