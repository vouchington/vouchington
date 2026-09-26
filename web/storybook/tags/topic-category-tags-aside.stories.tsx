import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicCategoryTagsAsideView } from '@/components/tags/topic-category-tags-aside-view'
import {
  clearCategoryRelationsFixture,
  setCategoryRelationsFixture,
} from '@/storybook/mocks/category-relations-store'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { EntityRelation } from '@/lib/api/entity-relations'

const topic = topics[0]!

const travel: EntityRelation = {
  id: 'relation-travel',
  created_at: '2026-05-01T00:00:00.000Z',
  created_by_id: 'user-story',
  object_data: { id: 'topic-travel', name: 'Travel', slug: 'travel', topic_type: 'topic' },
}

const meta = {
  title: 'Tags/Topic Category Tags Aside',
  beforeEach() {
    setCategoryRelationsFixture()
    return () => {
      clearCategoryRelationsFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Authenticated: Story = {
  render: () => (
    <StoryFrame>
      <TopicCategoryTagsAsideView
        electionVotes={{}}
        isAuthenticated
        relations={[travel]}
        topic={topic}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <TopicCategoryTagsAsideView
        isAuthenticated
        relations={[]}
        topic={topic}
      />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <TopicCategoryTagsAsideView
        isAuthenticated={false}
        relations={[]}
        topic={topic}
      />
    </StoryFrame>
  ),
}
