import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import {
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
} from '@voucha/test-helpers/entities/fediverse-instances'
import {
  createHistoryRetentionWindow,
  insertConfigHistoryAt,
  insertConfigHistoryBatch,
  insertPromptHistoryBatch,
  insertRssSettingHistoryAt,
} from '@voucha/test-helpers/history-retention-seeds'
import {
  acquireHistoryRetentionSweepTestLock,
  attemptDirectConfigHistoryDelete,
  attemptDirectConfigHistoryUpdate,
  attemptFlaggedConfigHistoryUpdate,
  cleanupHistoryFixtureIds,
  readHistoryCursor,
  readRemainingHistoryIds,
  reserveHistoryRetentionFixtureIds,
  positionHistoryCursorForTest,
  restoreHistoryCursorForTest,
  snapshotHistoryCursorForTest,
} from '@voucha/test-helpers/history-retention-reads'
import { cleanupHistory } from '../cleanup-histories.mts'

function afterUtcMonths(base: Date, months: number, milliseconds = 0): Date {
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth() + months,
      base.getUTCDate(),
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds() + milliseconds,
    ),
  )
}

/** Small owned ranges exercise the real PostgreSQL trigger and keyset contract. */
describe('bounded per-key history retention', () => {
  it('resumes a persisted raw cursor under its frozen sweep end', async () => {
    const lock = await acquireHistoryRetentionSweepTestLock()
    const kind = 'dynamic_configuration_revisions'
    const priorCursor = await snapshotHistoryCursorForTest(kind)
    const { base: oldBase, lowerBoundDate, upperBoundDate } = createHistoryRetentionWindow(20)
    const key = `retention-cursor-${crypto.randomUUID()}`
    const ids: string[] = []
    try {
      await positionHistoryCursorForTest(kind, lowerBoundDate)
      ids.push(...(await insertConfigHistoryBatch(key, oldBase, 3)))
      const pageOptions = {
        batchSize: 1,
        maxBatches: 1,
        now: afterUtcMonths(oldBase, 12, 10),
        lowerBoundDate,
        upperBoundDate,
        persistentCursorForTest: true,
      }

      expect(await cleanupHistory(kind, pageOptions)).toEqual({
        scanned: 1,
        changed: 0,
        hasMore: true,
      })
      const firstCursor = await readHistoryCursor('dynamic_configuration_revisions')
      expect(firstCursor?.cursor_id).toBe(ids[0])
      expect(firstCursor?.sweep_cutoff_id).not.toBeNull()

      const lateId = await insertConfigHistoryAt(key, new Date(oldBase.getTime() + 11))
      ids.push(lateId)
      const laterOptions = { ...pageOptions, now: afterUtcMonths(oldBase, 12, 100) }
      expect(await cleanupHistory(kind, laterOptions)).toEqual({
        scanned: 1,
        changed: 0,
        hasMore: true,
      })
      expect(await readHistoryCursor('dynamic_configuration_revisions')).toEqual({
        cursor_id: ids[1],
        sweep_cutoff_id: firstCursor?.sweep_cutoff_id,
      })
      expect(await cleanupHistory(kind, laterOptions)).toEqual({
        scanned: 1,
        changed: 0,
        hasMore: false,
      })
      expect(await readHistoryCursor('dynamic_configuration_revisions')).toEqual({
        cursor_id: null,
        sweep_cutoff_id: null,
      })
      expect(
        await cleanupHistory(kind, {
          ...laterOptions,
          batchSize: 10,
        }),
      ).toEqual({ scanned: 4, changed: 0, hasMore: false })
    } finally {
      try {
        await cleanupHistoryFixtureIds('dynamic_configuration_revisions', ids)
      } finally {
        try {
          await restoreHistoryCursorForTest(kind, priorCursor)
        } finally {
          await lock.release()
        }
      }
    }
  })

  it('keeps the newest 50 config revisions, and no direct delete or update is allowed', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('dynamic_configuration_revisions')
    const { base, ...range } = createHistoryRetentionWindow(52)
    const options = { ...range, batchSize: 25, maxBatches: 9 }
    const key = `retention-${crypto.randomUUID()}`
    const ids = await insertConfigHistoryBatch(key, base, 51)
    ownedIds.push(...ids)

    await expect(attemptDirectConfigHistoryDelete(ids[0]!)).rejects.toThrow('append-only')
    await expect(attemptDirectConfigHistoryUpdate(ids[0]!)).rejects.toThrow('append-only')
    await expect(attemptFlaggedConfigHistoryUpdate(ids[0]!)).rejects.toThrow('append-only')

    const capped = await cleanupHistory('dynamic_configuration_revisions', {
      ...options,
      batchSize: 7,
      maxBatches: 1,
      now: afterUtcMonths(base, 12, 52),
    })
    expect(capped).toEqual({ scanned: 7, changed: 1, hasMore: true })
    const remainder = await cleanupHistory('dynamic_configuration_revisions', {
      ...options,
      batchSize: 7,
      maxBatches: 8,
      now: afterUtcMonths(base, 12, 52),
    })
    expect(remainder).toEqual({ scanned: 50, changed: 0, hasMore: false })
    expect(await readRemainingHistoryIds('dynamic_configuration_revisions', ids)).toEqual(
      ids.slice(1),
    )
  })

  it('keeps the latest RSS decision independently per feed and setting type', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('rss_feed_setting_changes')
    const { base, ...range } = createHistoryRetentionWindow(5)
    const options = { ...range, batchSize: 25, maxBatches: 9 }
    const feed = await createTestRssFeed({})
    const ids = [
      await insertRssSettingHistoryAt(feed.id, base, true),
      await insertRssSettingHistoryAt(feed.id, new Date(base.getTime() + 1), false),
      await insertRssSettingHistoryAt(feed.id, new Date(base.getTime() + 2), true),
      await insertRssSettingHistoryAt(
        feed.id,
        new Date(base.getTime() + 3),
        false,
        'discoverability',
      ),
    ]
    ownedIds.push(...ids)

    const result = await cleanupHistory('rss_feed_setting_changes', {
      ...options,
      now: new Date(base.getTime() + 90 * 24 * 60 * 60 * 1000 + 4),
    })
    expect(result).toEqual({ scanned: 4, changed: 2, hasMore: false })
    expect(await readRemainingHistoryIds('rss_feed_setting_changes', ids)).toEqual(ids.slice(2))
  })

  it('keeps the latest fediverse allowlist decision after flapping', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds(
      'fediverse_instance_integration_changes',
    )
    const { base, ...range } = createHistoryRetentionWindow(4)
    const options = { ...range, batchSize: 25, maxBatches: 9 }
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({
      user,
      topic_type: 'fediverse_instance',
      hostname: `retention-${crypto.randomUUID()}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    const ids = [
      await insertTestFediverseInstanceIntegrationChange({
        topicId: topic.id,
        integrationStatus: 'approved',
        createdAt: base,
      }),
      await insertTestFediverseInstanceIntegrationChange({
        topicId: topic.id,
        integrationStatus: 'blocked',
        createdAt: new Date(base.getTime() + 1),
      }),
      await insertTestFediverseInstanceIntegrationChange({
        topicId: topic.id,
        integrationStatus: 'approved',
        createdAt: new Date(base.getTime() + 2),
      }),
    ]
    ownedIds.push(...ids)

    const result = await cleanupHistory('fediverse_instance_integration_changes', {
      ...options,
      now: afterUtcMonths(base, 12, 3),
    })
    expect(result).toEqual({ scanned: 3, changed: 2, hasMore: false })
    expect(await readRemainingHistoryIds('fediverse_instance_integration_changes', ids)).toEqual([
      ids[2],
    ])
  })

  it('keeps the newest 200 prompt revisions per community', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('community_agent_prompt_revisions')
    const { base, ...range } = createHistoryRetentionWindow(202)
    const options = { ...range, batchSize: 25, maxBatches: 9 }
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
    })
    const ids = await insertPromptHistoryBatch(community.id, prompt.id, base, 201)
    ownedIds.push(...ids)

    const result = await cleanupHistory('community_agent_prompt_revisions', {
      ...options,
      now: new Date(base.getTime() + 201),
    })
    expect(result).toEqual({ scanned: 201, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('community_agent_prompt_revisions', ids)).toEqual(
      ids.slice(1),
    )
  })
})
