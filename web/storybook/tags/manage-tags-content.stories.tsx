import { Suspense } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ManageTagsContent } from '@/components/tags/manage-tags-content'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

const topic = topics[0]!
const related = topics[1]!
const author = publicUsers[0]!

const filledRelations: EntityRelationsResponse = {
  results: [{ __entity_type: 'entity_relation', id: 'relation-sapphire-reserve' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  entity_relations: {
    'relation-sapphire-reserve': {
      id: 'relation-sapphire-reserve',
      object_id: related.id,
      created_at: now,
      created_by_id: author.id,
      votes_count_up: 6,
      votes_count_down: 1,
      object_data: {
        id: related.id,
        name: related.name,
        slug: related.slug,
        topic_type: related.topic_type,
      },
    },
  },
}

const emptyRelations: EntityRelationsResponse = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  entity_relations: {},
}

const filledRelationsPromise = Promise.resolve(filledRelations)
const emptyRelationsPromise = Promise.resolve(emptyRelations)

const meta = {
  title: 'Tags/Manage Tags Content',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const RelatedTopics: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading related topics</p>}>
        <ManageTagsContent
          entityType='topic'
          entityId={topic.id}
          predicate='related'
          objectType='topic'
          label='Topic'
          relationsPromise={filledRelationsPromise}
          isAuthenticated
        />
      </Suspense>
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading related topics</p>}>
        <ManageTagsContent
          entityType='topic'
          entityId={topic.id}
          predicate='related'
          objectType='topic'
          label='Topic'
          relationsPromise={emptyRelationsPromise}
          isAuthenticated={false}
        />
      </Suspense>
    </StoryFrame>
  ),
}
