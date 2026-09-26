import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNode } from '@/components/comments/comment-node'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import {
  commentAuthor,
  commentNode,
  deletedCommentNode,
  discussionPost,
} from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NodePreview({ node }: { node: typeof commentNode }) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [quoteMarkdown, setQuoteMarkdown] = useState('')
  const [addedReplies, setAddedReplies] = useState(0)
  return (
    <StoryFrame>
      {addedReplies > 0 ? <p>Replies added: {addedReplies}</p> : null}
      <CommentNode
        node={node}
        depth={0}
        rootPostId={discussionPost.id}
        rootPostType='discussion'
        collapsedIds={collapsedIds}
        replyToId={replyToId}
        quoteMarkdown={quoteMarkdown}
        onToggleCollapse={commentId => {
          setCollapsedIds(current => {
            const next = new Set(current)
            if (next.has(commentId)) next.delete(commentId)
            else next.add(commentId)
            return next
          })
        }}
        onToggleReply={setReplyToId}
        onCommentAdded={() => setAddedReplies(count => count + 1)}
        onQuote={comment => {
          setQuoteMarkdown(`> ${comment.id}`)
          setReplyToId(comment.id)
        }}
        isAdmin={false}
        isThreadLocked={false}
      />
    </StoryFrame>
  )
}

export const RestaurantBonus: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <NodePreview node={commentNode} />,
}

export const Deleted: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <NodePreview node={deletedCommentNode} />,
}
