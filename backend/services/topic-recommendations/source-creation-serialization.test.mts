import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  createTestUserDirect,
  getTestPostgresBackendProcessId,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import {
  getActiveLandingPageHostnameClaims,
  getFirstTestHostnameOwnershipLockKey,
} from '@voucha/test-helpers/hostname-ownership'
import { addUrl } from '@services/urls/upsert'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { getTopicByAny } from '@services/topics/get'
import { resolveHostname } from '@services/topics/resolve-hostname'
import { createInstanceFromHostname } from '../fediverse-instances/create-instance.mts'
import { createSourceWithRetry } from '../rss-feeds/create-source-helpers.mts'
import { createInstanceWithRetry } from '../fediverse-instances/create-instance-helpers.mts'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'
import { approveTopicRecommendationInTransaction } from './approve-topic-recommendation.mts'

describe('source creation serializes hostname ownership before aliases', () => {
  it.each(['rss', 'fediverse'] as const)(
    'preserves %s coexistence with an approved landing page',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const suffix = crypto.randomUUID()
      const parentHostname = `source-${suffix}.example.com`
      await upsertUrlHostnames(admin.id, [parentHostname])
      const hostname = `feed.${parentHostname}`
      const url = await addUrl(admin.id, `https://${hostname}/feed.xml`)
      expect(url).not.toBeNull()
      const hostnameId = url!.hostname.id
      const recommendation = await createTestTopicRecommendation(
        prepareTopicRecommendation,
        admin,
        WEB_PROVENANCE,
        {
          markdown: 'Source coexistence',
          topic_title: `Approved ${suffix}`,
          topic_slug: `approved-${suffix}`,
          topic_hostnames: [hostname],
        },
      )
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      const pid = await getTestPostgresBackendProcessId(holder)
      const lockKey = await getFirstTestHostnameOwnershipLockKey(holder, hostnameId)
      const result = await withTestOwnedPostgresWait(
        {
          pool: 'write',
          holderProcessId: pid,
          lock: { kind: 'advisory', key: lockKey },
          queryMarker: 'lockHostnameOwnership',
          releaseHolder: () => holder[Symbol.asyncDispose](),
        },
        async waitForLock => {
          const creating =
            kind === 'rss'
              ? createSourceWithRetry({
                  provenance: WEB_PROVENANCE,
                  currentUser: admin,
                  rssFeedUrlId: url!.id,
                  hostnameId,
                  feedUrl: `https://${hostname}/feed.xml`,
                  topicName: `Source ${suffix}`,
                  rawTitle: `Source ${suffix}`,
                  feedTitle: null,
                  feedType: 'article',
                  attempt: 0,
                })
              : createInstanceWithRetry({
                  provenance: WEB_PROVENANCE,
                  currentUser: admin,
                  hostnameId,
                  hostname,
                  attempt: 0,
                  details: { name: `Source ${suffix}`, slug: `source-${suffix}` },
                  metadata: null,
                })
          await waitForLock(creating)
          await holder.commit()
          return creating
        },
      )
      expect(result).not.toBeNull()
      if (!result) throw new Error('Source creation failed')
      expect(await getTopicByAny(result.topicId)).toMatchObject({ hostname_id: hostnameId })
      expect(await getActiveLandingPageHostnameClaims([hostnameId])).toContain(approved.topic.id)
    },
  )
  it('returns null when a hostname already has an instance after a creation conflict', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-existing-race-${Math.random().toString(36).slice(2, 10)}.example.com`
    const created = await createInstanceFromHostname(user, WEB_PROVENANCE, hostname)
    expect(created.status).toBe('created')
    const hostnameId = await resolveHostname(user.id, hostname)
    expect(hostnameId).not.toBeNull()

    await expect(
      createInstanceWithRetry({
        provenance: WEB_PROVENANCE,
        currentUser: user,
        hostnameId: hostnameId!,
        hostname,
        attempt: 0,
        metadata: null,
      }),
    ).resolves.toBeNull()
  })
})
