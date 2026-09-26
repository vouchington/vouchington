import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostRelatedTopicsAsideContent } from '@/components/tags/post-related-topics-aside-content'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation } from '@/lib/api/entity-relations'

const discussion = posts.find(post => post.post_type === 'discussion')!
const topic = topics[0]!
const author = publicUsers[0]!

const relations: EntityRelation[] = [
  {
    id: 'relation-open-banking',
    object_id: topic.id,
    created_at: now,
    created_by_id: author.id,
    votes_count_up: 8,
    votes_count_down: 1,
    object_data: {
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      topic_type: topic.topic_type,
    },
  },
]

const meta = {
  title: 'Tags/Related Topics Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithTopic: Story = {
  render: () => (
    <StoryFrame>
      <PostRelatedTopicsAsideContent
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
      <PostRelatedTopicsAsideContent
        post={discussion}
        relations={[]}
        showManageButton={false}
        showVoting={false}
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
