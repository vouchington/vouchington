import { describe, expect, it } from 'vitest'
import { beginTransaction, insertTestAgentModeration } from '@voucha/test-helpers'
import {
  createTestAgentModerationRetentionFixture,
  testAgentModerationExists,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { cleanupObsoleteAgentModerations } from '../cleanup-agent-moderations.mts'

describe('agent moderation retention repair', () => {
  it('deletes a superseded result even when the two insert statements could not see each other', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const [keeperFixture, fixture] = await Promise.all([
      createTestAgentModerationRetentionFixture(),
      createTestAgentModerationRetentionFixture(),
    ])
    const keeperId = await insertTestAgentModeration({ ...keeperFixture, occurredAt: at(96) })
    await using older = await beginTransaction()
    await using newer = await beginTransaction()
    const oldId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) }, older)
    const newestId = await insertTestAgentModeration({ ...fixture, occurredAt: at(94) }, newer)
    await older.commit()
    await newer.commit()

    const options = {
      now,
      lowerBoundDate,
      postIds: [keeperFixture.postId, fixture.postId],
      batchSize: 1,
      maxBatches: 1,
    }
    const first = await cleanupObsoleteAgentModerations(options)
    expect(first).toMatchObject({ deleted: 0, hasMore: true })
    expect(first.continuation?.repair?.afterId).toBe(keeperId)

    const result = await cleanupObsoleteAgentModerations({
      ...options,
      continuation: first.continuation!,
    })
    expect(result).toMatchObject({ deleted: 1 })
    const [keeperExists, oldExists, newestExists] = await Promise.all([
      testAgentModerationExists(keeperFixture.postId, keeperId),
      testAgentModerationExists(fixture.postId, oldId),
      testAgentModerationExists(fixture.postId, newestId),
    ])
    expect([keeperExists, oldExists, newestExists]).toEqual([true, false, true])
  })
})
