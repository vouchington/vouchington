import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostRelatedPostsAsideContent } from '@/components/tags/post-related-posts-aside-content'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation } from '@/lib/api/entity-relations'

const discussion = posts.find(post => post.post_type === 'discussion')!
const review = posts.find(post => post.post_type === 'review')!
const author = publicUsers[0]!

const relations: EntityRelation[] = [
  {
    id: 'relation-sapphire-review',
    object_id: review.id,
    created_at: now,
    created_by_id: author.id,
    votes_count_up: 4,
    votes_count_down: 0,
    object_data: {
      id: review.id,
      title: review.title,
      slug: review.slug,
      post_type: review.post_type,
    },
  },
]

const meta = {
  title: 'Tags/Related Posts Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithReview: Story = {
  render: () => (
    <StoryFrame>
      <PostRelatedPostsAsideContent
        post={discussion}
        relations={relations}
        showManageButton
        showVoting
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <PostRelatedPostsAsideContent
        post={discussion}
        relations={[]}
        showManageButton={false}
        showVoting={false}
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
