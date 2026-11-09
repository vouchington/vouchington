import { read } from '@data-stores/psql'
import { getPostIds } from '@services/posts/search/get-ids'
import { getPostFeedIds } from '@services/feeds/posts/get-ids'
import { getReferralLinksFeed } from '@services/feeds/referral-links/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { heavyFollowUser, runAndCapture } from '../run-support.mts'
import { seedHostnameExclusionPages } from '../seed-data/hostname-exclusion-pages.mts'

/** Capture each consumer of the candidate-correlated block/mute hostname exclusion filter. */
export async function runHostnameExclusionPageScenarios(): Promise<void> {
  await seedHostnameExclusionPages()
  const { rows } = await read<{ count: string }>(
    `/* runHostnameExclusionPageScenarios:seededRows */
     SELECT COUNT(*)::text AS count FROM url_hostnames`,
  )
  const hostnameRowCount = Number(rows[0]?.count)
  if (!Number.isSafeInteger(hostnameRowCount) || hostnameRowCount < 1)
    throw new Error('Hostname exclusion scenarios need a valid url_hostnames row count')

  for (const scenarioId of [
    'hostname-exclusion-post-feed',
    'hostname-exclusion-post-search',
    'hostname-exclusion-referral-links',
  ]) {
    registerScenarioContract(scenarioId, {
      expectations: [],
      seededRows: { url_hostnames: hostnameRowCount },
      forbidSequentialScans: ['url_hostnames'],
    })
  }

  await runAndCapture('hostname-exclusion-post-feed', () =>
    getPostFeedIds(heavyFollowUser, {
      feed_type: 'follow_users',
      time_range: '1w',
      limit: 25,
    }),
  )

  await runAndCapture('hostname-exclusion-post-search', () =>
    getPostIds(heavyFollowUser, {
      exclude_for_user_id: heavyFollowUser.id,
      time_range: 'all',
      limit: 25,
    }),
  )

  await runAndCapture('hostname-exclusion-referral-links', () =>
    getReferralLinksFeed(heavyFollowUser, 'follow_users', { limit: 25 }),
  )
}
