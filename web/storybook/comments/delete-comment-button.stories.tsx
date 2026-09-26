import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { DeleteCommentButton } from '@/components/comments/delete-comment-button'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost } from './comment-story-data'

const meta = {
  title: 'Comments/Delete Comment Button',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ConfirmDelete() {
  const [deleted, setDeleted] = useState(false)
  if (deleted) {
    return (
      <StoryFrame width='max-w-sm'>
        <p>Comment deleted</p>
      </StoryFrame>
    )
  }
  return (
    <StoryFrame width='max-w-sm'>
      <DeleteCommentButton
        commentId={commentPost.id}
        onDeleted={() => setDeleted(true)}
      />
    </StoryFrame>
  )
}

export const Confirm: Story = {
  render: () => <ConfirmDelete />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Delete' }))
  },
}
