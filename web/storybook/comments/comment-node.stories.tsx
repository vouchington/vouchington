import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNode } from '@/components/comments/comment-node'
import { CommentStoryFrame } from './comment-story-frame'
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
  return (
    <CommentStoryFrame>
      <CommentNode
        node={node}
        depth={0}
        rootPostId={discussionPost.id}
        rootPostType='discussion'
        collapsedIds={new Set()}
        replyToId={null}
        quoteMarkdown=''
        onToggleCollapse={() => {}}
        onToggleReply={() => {}}
        onCommentAdded={() => {}}
        onQuote={() => {}}
        isAdmin={false}
        isThreadLocked={false}
      />
    </CommentStoryFrame>
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
