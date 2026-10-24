import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostListEmptyState } from '@/components/posts/post-list-empty-state'
import { postRouteConfigs } from '@/lib/route-configs'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Post List Empty State',
  component: PostListEmptyState,
} satisfies Meta<typeof PostListEmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const CanCreate: Story = {
  args: { config: postRouteConfigs.reviews, isAuthenticated: true, hasSearch: false },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <PostListEmptyState {...args} />
    </StoryFrame>
  ),
}

export const SignInToCreate: Story = {
  args: { config: postRouteConfigs.reviews, isAuthenticated: false, hasSearch: false },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <PostListEmptyState {...args} />
    </StoryFrame>
  ),
}
