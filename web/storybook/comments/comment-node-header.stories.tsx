import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeHeader } from '@/components/comments/comment-node-header'
import { StoryFrame } from '@/storybook/story-frame'
import { commentNode, commentPermalink, deletedCommentNode } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Header',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Author: Story = {
  render: () => (
    <StoryFrame>
      <CommentNodeHeader
        childrenCount={0}
        hideDownCount={false}
        isAnonymous={false}
        isCollapsed={false}
        isDeleted={false}
        node={commentNode}
        onToggleCollapse={() => {}}
        permalink={commentPermalink}
        username={commentNode.post.created_by?.username ?? 'alex'}
      />
    </StoryFrame>
  ),
}

export const Deleted: Story = {
  render: () => (
    <StoryFrame>
      <CommentNodeHeader
        childrenCount={1}
        hideDownCount={false}
        isAnonymous={false}
        isCollapsed
        isDeleted
        node={deletedCommentNode}
        onToggleCollapse={() => {}}
        permalink={commentPermalink}
        username='deleted'
      />
    </StoryFrame>
  ),
}
