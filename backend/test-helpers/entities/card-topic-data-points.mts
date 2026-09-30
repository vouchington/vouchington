import { createTestUser } from './users.mts'
import { insertTestDataPoint } from './data-points.mts'
import { insertTestTopic } from './topics/core.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

type InsertTestDataPointInput = Parameters<typeof insertTestDataPoint>[0]

export type CardTopicFixture = {
  name: string
  slug: string
}

export type CardTopicDataPointFixture = Omit<
  InsertTestDataPointInput,
  'createdById' | 'topicId'
> & {
  topicIndex: number
}

/**
 * Creates one user, one card topic per entry, and the requested data points.
 * `topicIndex` selects the topic in `topics`. Suites keep their own names, slugs, and result mix.
 */
export async function insertTestCardTopicsWithDataPoints(input: {
  topics: readonly CardTopicFixture[]
  dataPoints: readonly CardTopicDataPointFixture[]
}): Promise<{
  user: PrivateUser
  topicIds: string[]
}> {
  const user = await createTestUser()
  const topicIds: string[] = []
  for (const topic of input.topics) {
    topicIds.push(
      await insertTestTopic({
        name: topic.name,
        slug: topic.slug,
        createdById: user.id,
        topicType: 'card',
      }),
    )
  }

  for (const { topicIndex, ...dataPoint } of input.dataPoints) {
    const topicId = topicIds[topicIndex]
    if (topicId === undefined) {
      throw new Error(`Card topic fixture index ${topicIndex} is out of range`)
    }
    await insertTestDataPoint({
      ...dataPoint,
      createdById: user.id,
      topicId,
    })
  }

  return { user, topicIds }
}
