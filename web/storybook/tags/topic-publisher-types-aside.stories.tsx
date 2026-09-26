import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicPublisherTypesAsideView } from '@/components/tags/topic-publisher-types-aside-view'
import {
  clearCategoryRelationsFixture,
  setCategoryRelationsFixture,
} from '@/storybook/mocks/category-relations-store'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { EntityRelation } from '@/lib/api/entity-relations'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const newsroom: EntityRelation = {
  id: 'relation-newsroom',
  created_at: '2026-05-01T00:00:00.000Z',
  created_by_id: 'user-story',
  object_data: {
    id: 'publisher-newsroom',
    name: 'Newsroom',
    slug: 'newsroom',
    topic_type: 'topic',
  },
}

const meta = {
  title: 'Tags/Topic Publisher Types Aside',
  beforeEach() {
    setCategoryRelationsFixture()
    return () => {
      clearCategoryRelationsFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Feed: Story = {
  render: () => (
    <StoryFrame>
      <TopicPublisherTypesAsideView
        electionVotes={{}}
        enumOptions={[{ id: 'publisher-newsroom', slug: 'newsroom', label: 'Newsroom' }]}
        isAuthenticated
        relations={[newsroom]}
        topic={feed}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <TopicPublisherTypesAsideView
        isAuthenticated
        relations={[]}
        topic={feed}
      />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <TopicPublisherTypesAsideView
        isAuthenticated={false}
        relations={[]}
        topic={feed}
      />
    </StoryFrame>
  ),
}
