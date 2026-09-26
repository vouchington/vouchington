import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReviewTopicsFieldset, type ReviewTopicEntry } from '@/components/posts/post-form-sections'
import {
  clearTopicSearchFixture,
  setTopicSearchFixture,
} from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'
import { cardTopic, rewardsTopic } from './fixtures'

const ratedTopics: ReviewTopicEntry[] = [
  { key: 'sapphire', topicId: cardTopic.id, topicName: cardTopic.name, rating: 5 },
  { key: 'rewards', topicId: rewardsTopic.id, topicName: rewardsTopic.name, rating: 4 },
]

const meta = {
  title: 'Posts/Review Topics Fieldset',
  component: ReviewTopicsFieldset,
  beforeEach() {
    setTopicSearchFixture()
    return () => clearTopicSearchFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

function ReviewTopicsStory({ reviewTopics }: { reviewTopics: ReviewTopicEntry[] }) {
  const [entries, setEntries] = useState(reviewTopics)
  return (
    <StoryFrame width='max-w-xl'>
      <ReviewTopicsFieldset
        reviewTopics={entries}
        setTopicInputRef={() => {}}
        moveReviewTopic={(index, direction) => {
          setEntries(current => {
            const next = [...current]
            const target = index + direction
            const moved = next[target]
            const currentEntry = next[index]
            if (!moved || !currentEntry) return current
            next[index] = moved
            next[target] = currentEntry
            return next
          })
        }}
        onReviewTopicChange={(index, id, name) => {
          setEntries(current =>
            current.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, topicId: id, topicName: name } : entry,
            ),
          )
        }}
        onReviewRatingChange={(index, rating) => {
          setEntries(current =>
            current.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, rating } : entry,
            ),
          )
        }}
        removeReviewTopic={index => {
          setEntries(current => current.filter((_, entryIndex) => entryIndex !== index))
        }}
        addReviewTopic={() => {
          setEntries(current => [
            ...current,
            { key: `topic-${current.length + 1}`, topicId: '', topicName: '', rating: 0 },
          ])
        }}
      />
    </StoryFrame>
  )
}

export const Rated: Story = {
  render: () => <ReviewTopicsStory reviewTopics={ratedTopics} />,
}

export const EmptyTopic: Story = {
  render: () => (
    <ReviewTopicsStory
      reviewTopics={[{ key: 'new-topic', topicId: '', topicName: '', rating: 0 }]}
    />
  ),
}
