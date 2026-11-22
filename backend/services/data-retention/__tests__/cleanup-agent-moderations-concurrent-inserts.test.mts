import { describe, expect, it, onTestFinished } from 'vitest'
import { getMinUuidv7ForDate } from '@modules/utils'
import { beginTransaction, insertTestAgentModeration } from '@voucha/test-helpers'
import {
  createTestAgentModerationRetentionFixture,
  testAgentModerationExists,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import {
  clearTestAgentModerationRepairCursor,
  getTestAgentModerationRepairCursor,
} from '@voucha/test-helpers/entities/agent-moderation-repair-cursor'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { cleanupObsoleteAgentModerations } from '../cleanup-agent-moderations.mts'

describe('agent moderation retention repair', () => {
  it('resumes bounded repair across daily runs when concurrent inserts missed the due date', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const [keeperFixture, fixture, dueFixture] = await Promise.all([
      createTestAgentModerationRetentionFixture(),
      createTestAgentModerationRetentionFixture(),
      createTestAgentModerationRetentionFixture(),
    ])
    const keeperId = await insertTestAgentModeration({ ...keeperFixture, occurredAt: at(96) })
    const dueId = await insertTestAgentModeration({ ...dueFixture, occurredAt: at(97) })
    await insertTestAgentModeration({ ...dueFixture, occurredAt: at(1) })
    await using older = await beginTransaction()
    await using newer = await beginTransaction()
    const oldId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) }, older)
    const newestId = await insertTestAgentModeration({ ...fixture, occurredAt: at(94) }, newer)
    await older.commit()
    await newer.commit()

    const upperId = getMinUuidv7ForDate(at(90))
    onTestFinished(() => clearTestAgentModerationRepairCursor(upperId))
    const options = {
      now,
      lowerBoundDate,
      postIds: [keeperFixture.postId, fixture.postId, dueFixture.postId],
      batchSize: 1,
      maxBatches: 1,
      persistentRepairCursorForTest: true,
    }
    const first = await cleanupObsoleteAgentModerations(options)
    expect(first).toMatchObject({ scanned: 0, deleted: 0, hasMore: true })
    if (!first.continuation) throw new Error('Expected the separate due backlog continuation')
    expect(await getTestAgentModerationRepairCursor()).toEqual({
      id: keeperId,
      post_id: keeperFixture.postId,
      upper_id: upperId,
    })
    expect(await testAgentModerationExists(fixture.postId, oldId)).toBe(true)
    expect(await testAgentModerationExists(dueFixture.postId, dueId)).toBe(true)

    expect(
      await cleanupObsoleteAgentModerations({ ...options, continuation: first.continuation }),
    ).toEqual({ scanned: 1, deleted: 1, hasMore: false, continuation: null })
    expect(await getTestAgentModerationRepairCursor()).toMatchObject({ id: keeperId })

    // A new daily invocation resumes without a continuation, even with a later cutoff.
    const nextDay = { ...options, now: new Date(now.getTime() + 86_400_000) }
    const repaired = await cleanupObsoleteAgentModerations(nextDay)
    expect(repaired).toMatchObject({ scanned: 1, deleted: 0, hasMore: true })
    if (!repaired.continuation) throw new Error('Expected a due continuation for the repair')
    expect(await testAgentModerationExists(fixture.postId, oldId)).toBe(true)
    expect(await getTestAgentModerationRepairCursor()).toEqual({
      id: oldId,
      post_id: fixture.postId,
      upper_id: upperId,
    })
    expect(
      await cleanupObsoleteAgentModerations({ ...nextDay, continuation: repaired.continuation }),
    ).toEqual({ scanned: 1, deleted: 1, hasMore: false, continuation: null })
    expect(await getTestAgentModerationRepairCursor()).toMatchObject({ id: oldId })
    await cleanupObsoleteAgentModerations(nextDay)
    await cleanupObsoleteAgentModerations(nextDay)
    expect(await getTestAgentModerationRepairCursor()).toBeNull()
    const [keeperExists, oldExists, newestExists] = await Promise.all([
      testAgentModerationExists(keeperFixture.postId, keeperId),
      testAgentModerationExists(fixture.postId, oldId),
      testAgentModerationExists(fixture.postId, newestId),
    ])
    expect([keeperExists, oldExists, newestExists]).toEqual([true, false, true])
  })
})
