import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import {
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
} from '@voucha/test-helpers/entities/fediverse-instances'
import {
  createHistoryRetentionWindow,
  insertRssSettingHistoryAt,
} from '@voucha/test-helpers/history-retention-seeds'
import {
  readRemainingHistoryIds,
  reserveHistoryRetentionFixtureIds,
} from '@voucha/test-helpers/history-retention-reads'
import { cleanupHistory } from '../cleanup-histories.mts'

const day = 24 * 60 * 60 * 1000

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

describe('history retention after the next same-key decision', () => {
  it('ages an RSS decision from its next same-setting decision', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('rss_feed_setting_changes')
    const { base, ...range } = createHistoryRetentionWindow(272 * day)
    const feed = await createTestRssFeed({})
    const nextAt = new Date(base.getTime() + 180 * day)
    const latestAt = new Date(nextAt.getTime() + 90 * day + 1)
    const ids = [
      await insertRssSettingHistoryAt(feed.id, base, true),
      await insertRssSettingHistoryAt(feed.id, nextAt, false),
      await insertRssSettingHistoryAt(feed.id, latestAt, true),
    ]
    ownedIds.push(...ids)
    const options = { ...range, batchSize: 5, maxBatches: 2 }

    expect(
      await cleanupHistory('rss_feed_setting_changes', {
        ...options,
        now: new Date(latestAt.getTime() + day),
      }),
    ).toEqual({ scanned: 2, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('rss_feed_setting_changes', ids)).toEqual(ids.slice(1))

    expect(
      await cleanupHistory('rss_feed_setting_changes', {
        ...options,
        now: new Date(latestAt.getTime() + 90 * day + 2),
      }),
    ).toEqual({ scanned: 2, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('rss_feed_setting_changes', ids)).toEqual([ids[2]])
  })

  it('ages a fediverse decision from its next decision for the topic', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds(
      'fediverse_instance_integration_changes',
    )
    const { base, ...range } = createHistoryRetentionWindow(940 * day)
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({
      user,
      topic_type: 'fediverse_instance',
      hostname: `retention-${crypto.randomUUID()}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    const nextAt = afterUtcMonths(base, 18)
    const latestAt = afterUtcMonths(nextAt, 12, 1)
    const ids = [
      await insertTestFediverseInstanceIntegrationChange({
        topicId: topic.id,
        integrationStatus: 'approved',
        createdAt: base,
      }),
      await insertTestFediverseInstanceIntegrationChange({
        topicId: topic.id,
        integrationStatus: 'blocked',
        createdAt: nextAt,
      }),
      await insertTestFediverseInstanceIntegrationChange({
        topicId: topic.id,
        integrationStatus: 'approved',
        createdAt: latestAt,
      }),
    ]
    ownedIds.push(...ids)
    const options = { ...range, batchSize: 5, maxBatches: 2 }

    expect(
      await cleanupHistory('fediverse_instance_integration_changes', {
        ...options,
        now: new Date(latestAt.getTime() + day),
      }),
    ).toEqual({ scanned: 2, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('fediverse_instance_integration_changes', ids)).toEqual(
      ids.slice(1),
    )

    expect(
      await cleanupHistory('fediverse_instance_integration_changes', {
        ...options,
        now: afterUtcMonths(latestAt, 12, 2),
      }),
    ).toEqual({ scanned: 2, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('fediverse_instance_integration_changes', ids)).toEqual([
      ids[2],
    ])
  })
})
