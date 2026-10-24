import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserTagsAsideView } from '@/components/users/user-tags-aside-view'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import {
  clearCategoryRelationsFixture,
  setCategoryRelationsFixture,
} from '@/storybook/mocks/category-relations-store'
import { StoryFrame } from '@/storybook/story-frame'
import type { EntityRelation } from '@/lib/api/entity-relations'

const meta = {
  title: 'Users/User Tags Aside View',
  parameters: { auth: { currentUser: storyCurrentUser } },
  beforeEach() {
    setCategoryRelationsFixture()
    return () => {
      clearCategoryRelationsFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const catalog = [
  { id: 'user-tag-expert', slug: 'expert', label: 'Expert' },
  { id: 'user-tag-reviewer', slug: 'reviewer', label: 'Reviewer' },
]

const relations: EntityRelation[] = [
  {
    id: 'relation-travel',
    created_at: '2026-05-01T00:00:00.000Z',
    created_by_id: 'user-story',
    object_data: { id: 'topic-travel', name: 'Travel', slug: 'travel', topic_type: 'topic' },
  },
  {
    id: 'relation-cards',
    created_at: '2026-05-02T00:00:00.000Z',
    created_by_id: 'user-story',
    object_data: { id: 'topic-cards', name: 'Credit cards', slug: 'cards', topic_type: 'topic' },
  },
]

export const WithTags: Story = {
  render: () => (
    <StoryFrame>
      <UserTagsAsideView
        userId='user-alex'
        canManageUserTags={false}
        relations={relations}
        catalog={catalog}
      />
    </StoryFrame>
  ),
}

export const Manageable: Story = {
  render: () => (
    <StoryFrame>
      <UserTagsAsideView
        userId='user-alex'
        canManageUserTags
        relations={relations}
        catalog={catalog}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <UserTagsAsideView
        userId='user-alex'
        canManageUserTags={false}
        relations={[]}
        catalog={catalog}
      />
    </StoryFrame>
  ),
}
