import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useTranslations } from '@/lib/i18n/use-translations'
import { topicTagsHref } from '@/lib/links/entity-href'
import { TopicRelationAsideCard } from '@/components/tags/topic-relation-aside-card'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation, EntityRelationsResponse } from '@/lib/api/entity-relations'

const topic = topics[0]!
const related = topics[1]!
const article = posts.find(post => post.post_type === 'article')!
const author = publicUsers[0]!

const faqRelations: EntityRelation[] = [
  {
    id: 'relation-transfer-partners',
    object_id: article.id,
    created_at: now,
    created_by_id: author.id,
    votes_count_up: 5,
    votes_count_down: 0,
    object_data: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      post_type: article.post_type,
    },
  },
]

const relatedResponse: EntityRelationsResponse = {
  results: [{ __entity_type: 'entity_relation', id: 'relation-related-topic' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  entity_relations: {
    'relation-related-topic': {
      id: 'relation-related-topic',
      object_id: related.id,
      created_at: now,
      created_by_id: author.id,
      votes_count_up: 4,
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

const meta = {
  title: 'Tags/Topic Relation Aside Card',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function FaqPostsStory({ empty }: { empty: boolean }) {
  const t = useTranslations()
  return (
    <StoryFrame>
      <TopicRelationAsideCard
        topic={topic}
        relations={empty ? [] : faqRelations}
        showManageButton={!empty}
        showVoting={!empty}
        isAuthenticated={!empty}
        t={t}
        asidePw='topic-faq-posts-aside'
        headingPw='topic-faq-posts-heading'
        heading={t('extracted.tags.topicFaqPostsAsideContent.faqPosts_09edffc6')}
        predicate='faq'
        objectType='post'
        manageHref={topicTagsHref(topic, 'post')}
        manageLabel={t('extracted.tags.topicFaqPostsAsideContent.manage_5a234448')}
      />
    </StoryFrame>
  )
}

export const FaqPosts: Story = {
  render: () => <FaqPostsStory empty={false} />,
}

export const EmptyFaqPosts: Story = {
  render: () => <FaqPostsStory empty />,
}

export const RelatedTopicsPage: Story = {
  render: () => <RelatedTopicsStory />,
}

function RelatedTopicsStory() {
  const t = useTranslations()
  return (
    <StoryFrame>
      <TopicRelationAsideCard
        topic={topic}
        relations={[]}
        response={relatedResponse}
        showManageButton
        showVoting
        isAuthenticated
        t={t}
        asidePw='topic-related-topics-aside'
        headingPw='topic-related-topics-heading'
        heading={t('extracted.tags.topicRelatedTopicsAsideContent.relatedTopics_aea370bc')}
        predicate='related'
        objectType='topic'
        manageHref={topicTagsHref(topic, 'topic')}
        manageLabel={t('extracted.tags.topicRelatedTopicsAsideContent.manage_5a234448')}
      />
    </StoryFrame>
  )
}
