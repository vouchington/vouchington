import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { withTestOwnedAdvisoryWait } from '@voucha/test-helpers/advisory-client-lock-observer'
import {
  getActiveLandingPageHostnameClaims,
  getFirstTestHostnameOwnershipLockKey,
} from '@voucha/test-helpers/hostname-ownership'
import { addUrl } from '@services/urls/upsert'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { getTopicByAny } from '@services/topics/get'
import { createSourceInTransaction } from '../rss-feeds/create-source-helpers.mts'
import { createInstanceInTransaction } from '../fediverse-instances/create-instance-helpers.mts'
import { createTopicRecommendation } from './create-topic-recommendation.mts'
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
      const recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
        markdown: 'Source coexistence',
        topic_title: `Approved ${suffix}`,
        topic_slug: `approved-${suffix}`,
        topic_hostnames: [hostname],
      })
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      const pid = await getTestPostgresBackendProcessId(holder)
      const lockKey = await getFirstTestHostnameOwnershipLockKey(holder, hostnameId)
      const result = await withTestOwnedAdvisoryWait(
        {
          pool: 'write',
          holderProcessId: pid,
          key: lockKey,
          queryMarker: 'lockHostnameOwnership',
          releaseHolder: () => holder[Symbol.asyncDispose](),
        },
        async waitForLock => {
          const creating =
            kind === 'rss'
              ? createSourceInTransaction(
                  WEB_PROVENANCE,
                  admin.id,
                  url!.id,
                  hostnameId,
                  `Source ${suffix}`,
                  `source-${suffix}`,
                  null,
                  'article',
                )
              : createInstanceInTransaction(
                  WEB_PROVENANCE,
                  admin.id,
                  hostnameId,
                  `Source ${suffix}`,
                  `source-${suffix}`,
                  null,
                )
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
})
