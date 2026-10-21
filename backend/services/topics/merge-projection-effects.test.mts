import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  applyTopicMergeProjectionEffects,
  getTopicMergeProjectionMetrics,
  seedStaleTopicMergeProjectionMetrics,
} from '@voucha/test-helpers/topic-merge-projection-effects'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('topic merge retained projection effects', () => {
  it('finishes source and destination effects without recreating source metrics and repairs destination ratings', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceRow = await createTestTopic({ user: admin })
    const destinationRow = await createTestTopic({ user: admin })
    const source = await getTopicByAny(sourceRow.id)
    const destination = await getTopicByAny(destinationRow.id)
    if (!source || !destination) throw new Error('Test topics not found')
    await mergeTopicAliases(admin, source, destination)
    await seedStaleTopicMergeProjectionMetrics(destination.id)
    await applyTopicMergeProjectionEffects([source.id, destination.id])
    await expect(getTopicMergeProjectionMetrics(source.id, destination.id)).resolves.toEqual([
      { topic_id: destination.id, ratings__count__5: 0 },
    ])
  })
})
