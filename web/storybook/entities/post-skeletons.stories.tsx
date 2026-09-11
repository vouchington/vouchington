import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostListSkeleton } from '@/components/posts/post-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Post Skeletons',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Post Skeletons'>
      <PostListSkeleton />
    </EntityStoryFrame>
  ),
}
