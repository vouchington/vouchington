import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PinnedPostsManager } from '@/components/communities/pinned-posts-manager'
import type {
  CommunityPostsResponseBody,
  CommunityPinnedPostsResponseBody,
} from '@/types/api-responses'
import { posts, postsResponse } from '@/storybook/entities/fixtures/posts'
import { now, page_info } from '@/storybook/entities/fixtures/shared'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Pinned Posts Manager',
  component: PinnedPostsManager,
} satisfies Meta<typeof PinnedPostsManager>

export default meta
type Story = StoryObj<typeof meta>

const selectedPosts = posts.slice(0, 3)
const data: CommunityPostsResponseBody = {
  results: selectedPosts.map(post => ({ __entity_type: 'post', id: post.id })),
  page_info,
  posts: Object.fromEntries(selectedPosts.map(post => [post.id, post])),
  posts_metrics: postsResponse.posts_metrics,
}

const pinned: CommunityPinnedPostsResponseBody['pinned_posts'] = [
  {
    community_id: 'community-credit-cards',
    created_at: now,
    order_index: 0,
    pinned_by_id: storyCurrentUser.id,
    post_id: selectedPosts[0]!.id,
  },
]

export const WithPinnedAndAvailablePosts: Story = {
  args: { communitySlug: 'credit-cards', posts: data, initialPinnedPosts: pinned },
  render: args => (
    <StoryFrame>
      <PinnedPostsManager {...args} />
    </StoryFrame>
  ),
}

export const NoPins: Story = {
  args: { communitySlug: 'credit-cards', posts: data, initialPinnedPosts: [] },
  render: args => (
    <StoryFrame>
      <PinnedPostsManager {...args} />
    </StoryFrame>
  ),
}
