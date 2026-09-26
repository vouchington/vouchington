import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { DeleteCommentButton } from '@/components/comments/delete-comment-button'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost } from './comment-story-data'

const meta = {
  title: 'Comments/Delete Comment Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Confirm: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <DeleteCommentButton
        commentId={commentPost.id}
        onDeleted={() => {}}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Delete' }))
  },
}
