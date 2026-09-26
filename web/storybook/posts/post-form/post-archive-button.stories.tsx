import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { PostArchiveButton } from '@/components/posts/post-form/post-archive-button'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Post Archive Button',
  component: PostArchiveButton,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Published: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <PostArchiveButton
        postIdOrSlug={reviewPost.slug ?? reviewPost.id}
        archivedAt={null}
      />
    </StoryFrame>
  ),
}

export const Archived: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <PostArchiveButton
        postIdOrSlug={reviewPost.slug ?? reviewPost.id}
        archivedAt={reviewPost.updated_at}
      />
    </StoryFrame>
  ),
}
