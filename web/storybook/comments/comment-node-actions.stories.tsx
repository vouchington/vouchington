import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeActions } from '@/components/comments/comment-node-actions'
import { StoryFrame } from '@/storybook/story-frame'
import { commentAuthor, commentNode, commentPermalink } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Actions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ActionsPreview() {
  return (
    <StoryFrame>
      <CommentNodeActions
        hideDownCount={false}
        isAdmin={false}
        node={commentNode}
        onQuote={() => {}}
        onToggleReply={() => {}}
        onStartEdit={() => {}}
        onDeleted={() => {}}
        permalink={commentPermalink}
        replyToId={null}
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
