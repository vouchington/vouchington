import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import type { BasicUser } from '@voucha/types/entities/user'
import { createTopicRecommendation } from '../create-topic-recommendation.mts'
import { DUPLICATE_RECOMMENDATION, DUPLICATE_TOPIC } from '@modules/on-error/error-codes'

describe('createTopicRecommendation duplicate detection', () => {
  let user: BasicUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('throws DUPLICATE_RECOMMENDATION (409) when a pending recommendation already exists for the same slug', async () => {
    const random = `dup-rec-${Date.now()}`
    const topicSlug = `dup-rec-topic-${random}`

    // Create the first recommendation successfully
    await createTopicRecommendation(
      user,
      {
        markdown: 'Initial rationale.',
        topic_title: `Dup Rec Topic ${random}`,
        topic_slug: topicSlug,
        topic_hostname: `dup-rec-${random}.example.com`,
      },
      { skipCreatedEvents: true },
    )

    // Attempting to create a second recommendation with the same slug must throw
    await expect(
      createTopicRecommendation(
        user,
        {
          markdown: 'Duplicate rationale.',
          topic_title: `Dup Rec Topic Again ${random}`,
          topic_slug: topicSlug,
          topic_hostname: `dup-rec-again-${random}.example.com`,
        },
        { skipCreatedEvents: true },
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: DUPLICATE_RECOMMENDATION,
    })
  })

  it('throws DUPLICATE_TOPIC (409) when a published topic already exists for the slug', async () => {
    const topic = await createTestTopic()

    await expect(
      createTopicRecommendation(
        user,
        {
          markdown: 'Topic already exists.',
          topic_title: topic.name,
          topic_slug: topic.slug,
          topic_hostname: `dup-topic-${Date.now()}.example.com`,
        },
        { skipCreatedEvents: true },
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: DUPLICATE_TOPIC,
    })
  })
})
