import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { EntityRelation } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import { TopicPredicateTagsAsideView } from '@/components/tags/topic-predicate-tags-aside-view'
import {
  clearCategoryRelationsFixture,
  setCategoryRelationsFixture,
} from '@/storybook/mocks/category-relations-store'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!
const feed = topics.find(item => item.topic_type === 'rss_feed')!

const travel: EntityRelation = {
  id: 'relation-travel',
  created_at: '2026-05-01T00:00:00.000Z',
  created_by_id: 'user-story',
  object_data: { id: 'topic-travel', name: 'Travel', slug: 'travel', topic_type: 'topic' },
}

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

function CategoryAside({
  isAuthenticated,
  relations,
}: {
  isAuthenticated: boolean
  relations: EntityRelation[]
}) {
  const t = useTranslations()
  return (
    <StoryFrame>
      <TopicPredicateTagsAsideView
        dataPw='category-tags-aside'
        electionVotes={{}}
        emptyLabel={t('extracted.tags.topicCategoryTagsAside.noCategoriesYet_7465b456')}
        isAuthenticated={isAuthenticated}
        manageLabel={t('extracted.tags.topicCategoryTagsAside.manage_5a234448')}
        predicate='category'
        relations={relations}
        title={t('extracted.tags.topicCategoryTagsAside.categories_b8b1d894')}
        topic={topic}
      />
    </StoryFrame>
  )
}

function PublisherAside({
  isAuthenticated,
  relations,
}: {
  isAuthenticated: boolean
  relations: EntityRelation[]
}) {
  const t = useTranslations()
  return (
    <StoryFrame>
      <TopicPredicateTagsAsideView
        dataPw='publisher-type-aside'
        electionVotes={{}}
        emptyLabel={t('extracted.tags.topicPublisherTypesAside.noPublisherTypeSet_e7af1583')}
        enumOptions={[{ id: 'publisher-newsroom', slug: 'newsroom', label: 'Newsroom' }]}
        isAuthenticated={isAuthenticated}
        manageLabel={t('extracted.tags.topicPublisherTypesAside.manage_5a234448')}
        predicate='publisher_type'
        relations={relations}
        title={t('extracted.tags.topicPublisherTypesAside.publisherType_9b943044')}
        topic={feed}
      />
    </StoryFrame>
  )
}

const meta = {
  title: 'Tags/Topic Predicate Tags Aside',
  beforeEach() {
    setCategoryRelationsFixture()
    return () => {
      clearCategoryRelationsFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Categories: Story = {
  render: () => (
    <CategoryAside
      isAuthenticated
      relations={[travel]}
    />
  ),
}

export const EmptyCategories: Story = {
  render: () => (
    <CategoryAside
      isAuthenticated
      relations={[]}
    />
  ),
}

export const SignedOutCategories: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <CategoryAside
      isAuthenticated={false}
      relations={[]}
    />
  ),
}

export const PublisherType: Story = {
  render: () => (
    <PublisherAside
      isAuthenticated
      relations={[newsroom]}
    />
  ),
}
