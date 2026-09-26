import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TagList } from '@/components/tags/tag-list'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation } from '@/lib/api/entity-relations'

const author = publicUsers[0]!
const relations: EntityRelation[] = topics.slice(0, 3).map((topic, index) => ({
  id: `relation-${topic.slug}`,
  object_id: topic.id,
  created_at: now,
  created_by_id: author.id,
  votes_count_up: 4 + index,
  votes_count_down: index,
  object_data: {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    topic_type: topic.topic_type,
  },
}))

const meta = {
  title: 'Tags/Tag List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Topics: Story = {
  render: () => (
    <StoryFrame>
      <TagList
        relations={relations}
        objectType='topic'
        showVoting
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <TagList
        relations={[]}
        objectType='topic'
        showVoting={false}
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
