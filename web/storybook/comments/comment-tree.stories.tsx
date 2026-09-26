import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentTree } from '@/components/comments/comment-tree'
import { CommentStoryFrame } from './comment-story-frame'
import {
  commentAuthor,
  commentTreeData,
  discussionPost,
  emptyCommentTreeData,
} from './comment-story-data'

const meta = {
  title: 'Comments/Comment Tree',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function TreePreview({ empty }: { empty?: boolean }) {
  return (
    <CommentStoryFrame>
      <CommentTree
        data={empty ? emptyCommentTreeData : commentTreeData}
        rootPostId={discussionPost.id}
        rootPostType='discussion'
        rootLockedAt={null}
        isAdmin={false}
        hideDownCount={false}
      />
    </CommentStoryFrame>
  )
}

export const RestaurantThread: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <TreePreview />,
}

export const Empty: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <TreePreview empty />,
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <TreePreview />,
}
