import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getPrivateCounts } from '@services/entity-fetch/metrics-private-counts'
import { getUserBookmarkCounts } from '@services/bookmarks/counts'
import { getProfileCountCap, profileCountProbeLimit } from '@services/users/profile-count-cap'
import { USER_PROFILE_COLLECTIONS } from '@ts-shared/user-profile-collections'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  PRIVATE_COUNT_AUTHOR_ID,
  PRIVATE_COUNT_TARGETS,
  seedProfilePrivateCounts,
} from '../seed-data/profile-private-counts.mts'

export async function runProfilePrivateCountsScenario(): Promise<void> {
  await seedProfilePrivateCounts()
  const cap = getProfileCountCap()
  assert(PRIVATE_COUNT_TARGETS > cap)
  const collections = USER_PROFILE_COLLECTIONS.filter(
    c => c.metricGroup === 'private_count' && c.relation,
  )
  const tables = [
    ...new Set(
      collections.flatMap(c => (c.relation ? [c.relation.tableName, c.relation.targetTable] : [])),
    ),
  ]
  // Include every relation and target in the dynamic count query, not just the populated pair.
  await write(`/* analyzePrivateCountRelations */ ANALYZE ${tables.join(', ')}`)
  registerScenarioContract('profile-private-counts', {
    expectations: [
      { kind: 'maxBitmapIndexRows', max: profileCountProbeLimit(cap) },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__user__mute__topic',
        max: profileCountProbeLimit(cap),
      },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__user__follow__topic',
        max: profileCountProbeLimit(cap),
      },
      { kind: 'maxProcessedRows', relation: 'topics', max: profileCountProbeLimit(cap) },
    ],
    forbidSequentialScans: [
      'topics',
      'relation__user__mute__topic',
      'relation__user__follow__topic',
    ],
    seededRows: { relation__user__mute__topic: PRIVATE_COUNT_TARGETS * 6 },
    crossPartition: {
      posts: 'Private relation targets are resolved by their exact post ids across ranges.',
    },
  })
  await runAndCapture('profile-private-counts', async () => {
    const counts = await getPrivateCounts(PRIVATE_COUNT_AUTHOR_ID, {})
    assert.equal(counts.counts.topics_muted, cap)
    assert.equal(counts.capped.topics_muted, true)
    const bookmarks = await getUserBookmarkCounts(PRIVATE_COUNT_AUTHOR_ID)
    assert.deepEqual(bookmarks.bookmarks.topics.follow, { count: cap, capped: true })
  })
}
