import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentTree } from '@/components/comments/comment-tree'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import {
  commentAuthor,
  commentTreeData,
  discussionPost,
  emptyCommentTreeData,
} from './comment-story-data'

const meta = {
  title: 'Comments/Comment Tree',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function TreePreview({ empty }: { empty?: boolean }) {
  return (
    <StoryFrame>
      <CommentTree
        data={empty ? emptyCommentTreeData : commentTreeData}
        rootPostId={discussionPost.id}
        rootPostType='discussion'
        rootLockedAt={null}
        isAdmin={false}
        hideDownCount={false}
      />
    </StoryFrame>
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
