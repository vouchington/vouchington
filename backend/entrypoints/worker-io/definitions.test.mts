import { describe, expect, it } from 'vitest'
import { upsertSchedules as upsertActivityPubInboxSchedules } from '@queues/activitypub/enqueues/schedules'
import { upsertSchedules as upsertAccountLifecycleSchedules } from '@queues/account-lifecycle/enqueues/schedules'
import { upsertSchedules as upsertBloomFilterSchedules } from '@queues/bloom-filters/enqueues/schedules'
import { upsertSchedules as upsertFindYourFriendsSchedules } from '@queues/find-your-friends/enqueues/schedules'
import { upsertSchedules as upsertKagiSmallwebSchedules } from '@queues/kagi-smallweb/enqueues/schedules'
import { upsertSchedules as upsertMembershipSchedules } from '@queues/memberships/enqueues/schedules'
import { upsertSchedules as upsertNotificationSchedules } from '@queues/notifications/enqueues/schedules'
import { upsertSchedules as upsertOAuthAuthorizationExchangeSchedules } from '@queues/oauth-authorization-exchange/enqueues/schedules'
import { upsertSchedules as upsertEmailSchedules } from '@queues/emails/enqueues/schedules'
import { upsertSchedules as upsertEntityListenerSchedules } from '@queues/entity-listeners/enqueues/schedules'
import { upsertSchedules as upsertOpenAiModerationSchedules } from '@queues/openai-moderation/enqueues/schedules'
import { upsertSchedules as upsertPsqlSchedules } from '@queues/psql/enqueues/schedules'
import { upsertSchedules as upsertRssFeedSchedules } from '@queues/rss-feeds/enqueues/schedules'
import { upsertSchedules as upsertRssFeedMaintenanceSchedules } from '@queues/rss-feed-maintenance/enqueues/schedules'
import { upsertSchedules as upsertStoryPostRelatedUrlProjectionSchedules } from '@queues/story-post-related-url-projections/enqueues/schedules'
import { upsertSchedules as upsertSitemapSchedules } from '@queues/sitemaps/enqueues/schedules'
import { upsertSchedules as upsertSesInboundSchedules } from '@queues/ses-inbound/enqueues/schedules'
import { upsertSchedules as upsertUrlDomainBlacklistSchedules } from '@queues/urls-domains-blacklist/enqueues/schedules'
import { upsertSchedules as upsertVoteWeightSchedules } from '@queues/vote-aggregation/enqueues/schedules'
import { SCHEDULE_DEFINITIONS } from './definitions.mts'

describe('worker-io SCHEDULE_DEFINITIONS load functions', () => {
  it('each schedule definition load resolves to the expected export', async () => {
    const byQueue = (name: string) => SCHEDULE_DEFINITIONS.find(d => d.queueName === name)!

    await expect(byQueue('story-post-related-url-projections').load()).resolves.toBe(
      upsertStoryPostRelatedUrlProjectionSchedules,
    )
    await expect(byQueue('activitypub').load()).resolves.toBe(upsertActivityPubInboxSchedules)
    await expect(byQueue('entity-listeners').load()).resolves.toBe(upsertEntityListenerSchedules)
    await expect(byQueue('notifications').load()).resolves.toBe(upsertNotificationSchedules)
    await expect(byQueue('urls-domains-blacklist').load()).resolves.toBe(
      upsertUrlDomainBlacklistSchedules,
    )
    await expect(byQueue('rss-feeds').load()).resolves.toBe(upsertRssFeedSchedules)
    await expect(byQueue('rss-feed-maintenance').load()).resolves.toBe(
      upsertRssFeedMaintenanceSchedules,
    )
    await expect(byQueue('emails').load()).resolves.toBe(upsertEmailSchedules)
    await expect(byQueue('psql').load()).resolves.toBe(upsertPsqlSchedules)
    await expect(byQueue('account-lifecycle').load()).resolves.toBe(upsertAccountLifecycleSchedules)
    await expect(byQueue('oauth-authorization-exchange').load()).resolves.toBe(
      upsertOAuthAuthorizationExchangeSchedules,
    )
    await expect(byQueue('openai_moderation_omni_single').load()).resolves.toBe(
      upsertOpenAiModerationSchedules,
    )
    await expect(byQueue('bloom-filters').load()).resolves.toBe(upsertBloomFilterSchedules)
    await expect(byQueue('find-your-friends').load()).resolves.toBe(upsertFindYourFriendsSchedules)
    await expect(byQueue('sitemaps').load()).resolves.toBe(upsertSitemapSchedules)
    await expect(byQueue('memberships').load()).resolves.toBe(upsertMembershipSchedules)
    await expect(byQueue('vote-aggregation').load()).resolves.toBe(upsertVoteWeightSchedules)
    await expect(byQueue('kagi-smallweb').load()).resolves.toBe(upsertKagiSmallwebSchedules)
    await expect(byQueue('ses_inbound').load()).resolves.toBe(upsertSesInboundSchedules)
  })

  it('registers the account, entity, and Stripe recovery schedules', async () => {
    await expect(
      Promise.all([
        upsertAccountLifecycleSchedules(),
        upsertEntityListenerSchedules(),
        upsertMembershipSchedules(),
      ]),
    ).resolves.toHaveLength(3)
  })
})
