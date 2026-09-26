import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostSlugField } from '@/components/posts/post-form/post-slug-field'
import { StoryFrame } from '@/storybook/story-frame'
import { administrator, reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Post Slug Field',
  component: PostSlugField,
  parameters: { auth: { currentUser: administrator } },
} satisfies Meta

export default meta
type Story = StoryObj

export const ExistingSlug: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <PostSlugField
        initialSlug={reviewPost.slug ?? reviewPost.id}
        onSlugChange={() => {}}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <PostSlugField
        initialSlug=''
        onSlugChange={() => {}}
      />
    </StoryFrame>
  ),
}
