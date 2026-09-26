import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TagItem } from '@/components/tags/tag-item'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'

const topic = topics[1]!
const review = posts.find(post => post.post_type === 'review')!
const author = publicUsers[0]!

const meta = {
  title: 'Tags/Tag Item',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Topic: Story = {
  render: () => (
    <StoryFrame>
      <TagItem
        relation={{
          id: 'relation-sapphire-reserve',
          object_id: topic.id,
          created_at: now,
          created_by_id: author.id,
          votes_count_up: 9,
          votes_count_down: 1,
          object_data: {
            id: topic.id,
            name: topic.name,
            slug: topic.slug,
            topic_type: topic.topic_type,
          },
        }}
        objectType='topic'
        showVoting
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const Review: Story = {
  render: () => (
    <StoryFrame>
      <TagItem
        relation={{
          id: 'relation-sapphire-review',
          object_id: review.id,
          created_at: now,
          created_by_id: author.id,
          votes_count_up: 3,
          votes_count_down: 0,
          object_data: {
            id: review.id,
            title: review.title,
            slug: review.slug,
            post_type: review.post_type,
          },
        }}
        objectType='post'
        showVoting={false}
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
