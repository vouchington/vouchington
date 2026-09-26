import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentNodeEditForm } from '@/components/comments/comment-node-edit-form'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost } from './comment-story-data'

const meta = {
  title: 'Comments/Comment Node Edit Form',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function EditableComment() {
  const [saved, setSaved] = useState<string | null>(null)
  if (saved != null) {
    return (
      <StoryFrame width='max-w-xl'>
        <p>Comment updated</p>
        <p>{saved}</p>
      </StoryFrame>
    )
  }
  return (
    <StoryFrame width='max-w-xl'>
      <CommentNodeEditForm
        post={commentPost}
        onSave={post => setSaved(post.markdown ?? '')}
        onCancel={() => {}}
      />
    </StoryFrame>
  )
}

export const SapphireReserveNote: Story = {
  render: () => <EditableComment />,
}
