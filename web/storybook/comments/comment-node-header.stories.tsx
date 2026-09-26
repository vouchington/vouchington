import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeHeader } from '@/components/comments/comment-node-header'
import { StoryFrame } from '@/storybook/story-frame'
import { commentNode, commentPermalink, deletedCommentNode } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Header',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function HeaderPreview({
  initiallyCollapsed,
  isDeleted,
  childrenCount,
  node,
  username,
}: {
  initiallyCollapsed: boolean
  isDeleted: boolean
  childrenCount: number
  node: typeof commentNode
  username: string
}) {
  const [isCollapsed, setIsCollapsed] = useState(initiallyCollapsed)
  return (
    <StoryFrame>
      <CommentNodeHeader
        childrenCount={childrenCount}
        hideDownCount={false}
        isAnonymous={false}
        isCollapsed={isCollapsed}
        isDeleted={isDeleted}
        node={node}
        onToggleCollapse={() => setIsCollapsed(collapsed => !collapsed)}
        permalink={commentPermalink}
        username={username}
      />
    </StoryFrame>
  )
}

export const Author: Story = {
  render: () => (
    <HeaderPreview
      initiallyCollapsed={false}
      isDeleted={false}
      childrenCount={0}
      node={commentNode}
      username={commentNode.post.created_by?.username ?? 'alex'}
    />
  ),
}

export const Deleted: Story = {
  render: () => (
    <HeaderPreview
      initiallyCollapsed
      isDeleted
      childrenCount={1}
      node={deletedCommentNode}
      username='deleted'
    />
  ),
}
