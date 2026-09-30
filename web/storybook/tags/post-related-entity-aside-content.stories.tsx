import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { PostRelatedEntityAsideContent } from '@/components/tags/post-related-entity-aside-content'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation } from '@/lib/api/entity-relations'

const discussion = posts.find(post => post.post_type === 'discussion')!
const review = posts.find(post => post.post_type === 'review')!
const topic = topics[0]!
const author = publicUsers[0]!

function relation(
  id: string,
  objectId: string,
  objectData: EntityRelation['object_data'],
): EntityRelation {
  return {
    id,
    object_id: objectId,
    created_at: now,
    created_by_id: author.id,
    votes_count_up: 4,
    votes_count_down: 0,
    object_data: objectData,
  }
}

const meta = {
  title: 'Tags/Related Entity Aside',
  beforeEach() {
    setStoryMutationFixture()
    return () => {
      clearStoryMutationFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Posts: Story = {
  render: () => (
    <StoryFrame>
      <PostRelatedEntityAsideContent
        kind='posts'
        post={discussion}
        relations={[
          relation('relation-sapphire-review', review.id, {
            id: review.id,
            title: review.title,
            slug: review.slug,
            post_type: review.post_type,
          }),
        ]}
        showManageButton
        showVoting
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const Topics: Story = {
  render: () => (
    <StoryFrame>
      <PostRelatedEntityAsideContent
        kind='topics'
        post={discussion}
        relations={[
          relation('relation-open-banking', topic.id, {
            id: topic.id,
            name: topic.name,
            slug: topic.slug,
            topic_type: topic.topic_type,
          }),
        ]}
        showManageButton
        showVoting
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const Urls: Story = {
  render: () => (
    <StoryFrame>
      <PostRelatedEntityAsideContent
        kind='urls'
        post={discussion}
        relations={[
          relation('relation-example-url', 'url-1', {
            id: 'url-1',
            url: 'https://example.com/open-banking',
            latest_crawl: { title: 'Open banking guide', image_url: null },
          }),
        ]}
        showManageButton
        showVoting
        isAuthenticated
      />
    </StoryFrame>
  ),
}
