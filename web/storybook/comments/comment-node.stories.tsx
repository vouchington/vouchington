import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNode } from '@/components/comments/comment-node'
import { StoryFrame } from '@/storybook/story-frame'
import {
  commentAuthor,
  commentNode,
  deletedCommentNode,
  discussionPost,
} from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NodePreview({ node }: { node: typeof commentNode }) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  return (
    <StoryFrame>
      <CommentNode
        node={node}
        depth={0}
        rootPostId={discussionPost.id}
        rootPostType='discussion'
        collapsedIds={collapsedIds}
        replyToId={null}
        quoteMarkdown=''
        onToggleCollapse={commentId => {
          setCollapsedIds(current => {
            const next = new Set(current)
            if (next.has(commentId)) next.delete(commentId)
            else next.add(commentId)
            return next
          })
        }}
        onToggleReply={() => {}}
        onCommentAdded={() => {}}
        onQuote={() => {}}
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
