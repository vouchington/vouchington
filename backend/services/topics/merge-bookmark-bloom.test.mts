import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { registerBookmarkBloomFixture } from '@voucha/test-helpers/bookmark-bloom-fixture'
import {
  getTopicMergeBookmarks,
  seedTopicMergeReadyBookmarkBloom,
} from '@voucha/test-helpers/topic-merge-bookmark-bloom'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('topic merge bookmark bloom maintenance', () => {
  const fixture = registerBookmarkBloomFixture()

  it('keeps destination follows visible through an already-ready owner bloom filter', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceRow = await createTestTopic({ user: admin })
    const destinationRow = await createTestTopic({ user: admin })
    const source = await getTopicByAny(sourceRow.id)
    const destination = await getTopicByAny(destinationRow.id)
    if (!source || !destination) throw new Error('Test topics not found')
    await seedTopicMergeReadyBookmarkBloom(fixture.user, source.id)
    const before = await getTopicMergeBookmarks(fixture.user, [source.id, destination.id])
    expect(before[source.id]?.follow).toBe(true)
    expect(before[destination.id]?.follow).not.toBe(true)
    await mergeTopicAliases(admin, source, destination)
    const after = await getTopicMergeBookmarks(fixture.user, [destination.id])
    expect(after[destination.id]?.follow).toBe(true)
  })
})
