import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PinnedPostsManager } from '@/components/communities/pinned-posts-manager'
import type {
  CommunityPostsResponseBody,
  CommunityPinnedPostsResponseBody,
} from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { posts, postsResponse } from '@/storybook/entities/entity-fixtures'
import { StoryFrame } from '@/storybook/story-frame'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'

const meta = {
  title: 'Communities/Pinned Posts Manager',
  component: PinnedPostsManager,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof PinnedPostsManager>

export default meta
type Story = StoryObj<typeof meta>

const community = communities[0]!
const selectedPosts = posts.slice(0, 3)
const postData: CommunityPostsResponseBody = {
  results: selectedPosts.map(post => ({ __entity_type: 'post', id: post.id })),
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: postsResponse.posts,
  posts_metrics: postsResponse.posts_metrics,
}
const pinnedPosts: CommunityPinnedPostsResponseBody['pinned_posts'] = [
  {
    community_id: community.id,
    post_id: selectedPosts[0]!.id,
    order_index: 0,
    pinned_by_id: 'user-story-current',
    created_at: '2026-05-10T12:00:00.000Z',
  },
]

export const OnePinnedTwoAvailable: Story = {
  args: {
    communitySlug: community.slug,
    posts: postData,
    initialPinnedPosts: pinnedPosts,
  },
  render: args => (
    <StoryFrame>
      <PinnedPostsManager {...args} />
    </StoryFrame>
  ),
}
