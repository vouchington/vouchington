import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DeletePostMenuItem } from '@/components/posts/delete-post-menu-item'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from './fixtures'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Delete Post Menu Item',
  component: DeletePostMenuItem,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

function DeleteReview() {
  const [deleted, setDeleted] = useState(false)
  return (
    <StoryFrame width='max-w-sm'>
      {deleted ? (
        <p>Post deleted</p>
      ) : (
        <OpenPostMenu>
          <DeletePostMenuItem
            onDeleted={() => setDeleted(true)}
            postIdOrSlug={reviewPost.slug ?? reviewPost.id}
          />
        </OpenPostMenu>
      )}
    </StoryFrame>
  )
}

export const Review: Story = {
  render: () => <DeleteReview />,
}
