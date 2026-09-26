import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeEditForm } from '@/components/comments/comment-node-edit-form'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Edit Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SapphireReserveNote: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CommentNodeEditForm
        post={commentPost}
        onSave={() => {}}
        onCancel={() => {}}
      />
    </StoryFrame>
  ),
}
