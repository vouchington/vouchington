import { Suspense } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicFaqPostsAsideStreaming } from '@/components/tags/topic-faq-posts-aside-streaming'
import { TopicRelatedTopicsAsideStreaming } from '@/components/tags/topic-related-topics-aside-streaming'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'
import { posts } from '@/storybook/entities/fixtures/posts'
import { now, page_info } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = { title: 'Tags/Streaming Asides' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const article = posts.find(post => post.post_type === 'article')!
const related = topics[1]!
const author = publicUsers[0]!

const faqResponse: EntityRelationsResponse = {
  results: [{ __entity_type: 'entity_relation', id: 'relation-faq-story' }],
  page_info,
  entity_relations: {
    'relation-faq-story': {
      id: 'relation-faq-story',
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
  },
}

const relatedResponse: EntityRelationsResponse = {
  results: [{ __entity_type: 'entity_relation', id: 'relation-related-story' }],
  page_info,
  entity_relations: {
    'relation-related-story': {
      id: 'relation-related-story',
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

const faqPromise = Promise.resolve(faqResponse)
const relatedPromise = Promise.resolve(relatedResponse)

export const FaqPosts: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p>Loading FAQ posts</p>}>
        <TopicFaqPostsAsideStreaming
          topic={topics[0]!}
          responsePromise={faqPromise}
        />
      </Suspense>
    </StoryFrame>
  ),
}

export const RelatedTopics: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p>Loading related topics</p>}>
        <TopicRelatedTopicsAsideStreaming
          topic={topics[0]!}
          responsePromise={relatedPromise}
        />
      </Suspense>
    </StoryFrame>
  ),
}
