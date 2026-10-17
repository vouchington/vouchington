import { describe, expect, it } from 'vitest'
import { upsertSchedules as upsertBloomFilterSchedules } from '@queues/bloom-filters/enqueues/schedules'
import { upsertSchedules as upsertKagiSmallwebSchedules } from '@queues/kagi-smallweb/enqueues/schedules'
import { upsertSchedules as upsertMembershipSchedules } from '@queues/memberships/enqueues/schedules'
import { upsertSchedules as upsertEmailSchedules } from '@queues/emails/enqueues/schedules'
import { upsertSchedules as upsertPsqlSchedules } from '@queues/psql/enqueues/schedules'
import { upsertSchedules as upsertRssFeedSchedules } from '@queues/rss-feeds/enqueues/schedules'
import { upsertSchedules as upsertRssFeedMaintenanceSchedules } from '@queues/rss-feed-maintenance/enqueues/schedules'
import { upsertSchedules as upsertSitemapSchedules } from '@queues/sitemaps/enqueues/schedules'
import { upsertSchedules as upsertUrlDomainBlacklistSchedules } from '@queues/urls-domains-blacklist/enqueues/schedules'
import { SCHEDULE_DEFINITIONS } from './definitions.mts'

describe('worker-io SCHEDULE_DEFINITIONS load functions', () => {
  it('each schedule definition load resolves to the expected export', async () => {
    const byQueue = (name: string) => SCHEDULE_DEFINITIONS.find(d => d.queueName === name)!

    await expect(byQueue('urls-domains-blacklist').load()).resolves.toBe(
      upsertUrlDomainBlacklistSchedules,
    )
    await expect(byQueue('rss-feeds').load()).resolves.toBe(upsertRssFeedSchedules)
    await expect(byQueue('rss-feed-maintenance').load()).resolves.toBe(
      upsertRssFeedMaintenanceSchedules,
    )
    await expect(byQueue('emails').load()).resolves.toBe(upsertEmailSchedules)
    await expect(byQueue('psql').load()).resolves.toBe(upsertPsqlSchedules)
    await expect(byQueue('bloom-filters').load()).resolves.toBe(upsertBloomFilterSchedules)
    await expect(byQueue('sitemaps').load()).resolves.toBe(upsertSitemapSchedules)
    await expect(byQueue('memberships').load()).resolves.toBe(upsertMembershipSchedules)
    await expect(byQueue('kagi-smallweb').load()).resolves.toBe(upsertKagiSmallwebSchedules)
    await expect(byQueue('background').load()).resolves.toBeTypeOf('function')
  })

  it('registers the background (including account recovery) and Stripe recovery schedules', async () => {
    const upsertBackgroundSchedules = await SCHEDULE_DEFINITIONS.find(
      d => d.queueName === 'background',
    )!.load()
    await expect(
      Promise.all([upsertBackgroundSchedules(), upsertMembershipSchedules()]),
    ).resolves.toHaveLength(2)
  })
})
