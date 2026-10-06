import { caches } from '@services/entity-cache/caches'
import type { UpdateUserOptions } from '@services/users/types'
import { updateUserFields } from '@services/users/update-fields'
import { createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { trackUserMetricsFills } from '../../test-helpers/user-metrics-cache-fills.mts'
import { getUserMetricsByAnyCached } from './metrics.mts'

describe('updateUserFields user metrics invalidation', () => {
  it('invalidates cached anonymous profile metrics for every count visibility field', async () => {
    const visibilityFields = [
      'community_memberships_visibility',
      'followers_visibility',
      'follows_visibility',
      'rss_feed_follows_visibility',
      'topic_follows_visibility',
    ] as const satisfies ReadonlyArray<keyof UpdateUserOptions>
    const users = await Promise.all(visibilityFields.map(() => createTestUser()))

    for (const [index, field] of visibilityFields.entries()) {
      const user = users[index]!
      expect(user.username).not.toBeNull()

      // A read by id fills only the id key; the by-username read fills the username key the
      // invalidation must also clear.
      await fillCachedMetrics(user.id)
      await fillCachedMetrics(user.username!)

      await updateUserFields(user.id, { [field]: 'nobody' })

      expect(await caches.user_metrics.get(user.id)).toBeNull()
      expect(await caches.user_metrics.get(user.username!)).toBeNull()
    }
  })

  it('preserves cached anonymous profile metrics for unrelated visibility fields', async () => {
    const visibilityFields = [
      'cards_visibility',
      'direct_messages_audience',
      'likes_visibility',
      'rewards_program_statuses_visibility',
      'spending_categories_visibility',
    ] as const satisfies ReadonlyArray<keyof UpdateUserOptions>
    const user = await createTestUser()

    await fillCachedMetrics(user.id)

    for (const field of visibilityFields) {
      await updateUserFields(user.id, { [field]: 'nobody' })

      expect(await caches.user_metrics.get(user.id)).not.toBeNull()
    }
  })
})

async function fillCachedMetrics(key: string): Promise<void> {
  const fills: Promise<unknown>[] = []
  const stop = trackUserMetricsFills(caches.user_metrics, fills)
  try {
    await getUserMetricsByAnyCached(key)
    if ((await caches.user_metrics.get(key)) == null) await Promise.all(fills)
  } finally {
    stop()
  }
}
