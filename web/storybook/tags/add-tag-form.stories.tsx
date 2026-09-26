import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearTopicSearchFixture,
  setTopicSearchFixture,
} from '@/storybook/mocks/client-api-instance'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { AddTagForm } from '@/components/tags/add-tag-form'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!

const meta = {
  title: 'Tags/Add Tag Form',
  beforeEach() {
    setStoryMutationFixture()
    setTopicSearchFixture()
    return () => {
      clearStoryMutationFixture()
      clearTopicSearchFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PublisherTypes: Story = {
  render: () => (
    <StoryFrame>
      <AddTagForm
        entityType='topic'
        entityId={topic.id}
        predicate='publisher_type'
        objectType='topic'
        enumSelectLabel='Publisher type'
        enumOptions={[
          { id: 'publisher-newsroom', slug: 'newsroom', label: 'Newsroom' },
          { id: 'publisher-blog', slug: 'independent-blog', label: 'Independent blog' },
        ]}
        onTagAdded={() => undefined}
      />
    </StoryFrame>
  ),
}

export const TopicSearch: Story = {
  render: () => (
    <StoryFrame>
      <AddTagForm
        entityType='topic'
        entityId={topic.id}
        predicate='related'
        objectType='topic'
        excludeIds={['topic-sapphire-reserve']}
        onTagAdded={() => undefined}
      />
    </StoryFrame>
  ),
}
