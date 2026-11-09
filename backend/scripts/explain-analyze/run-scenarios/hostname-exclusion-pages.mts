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
  const { rows } = await read<{
    hostname_count: string
    referral_program_topic_count: string
  }>(
    `/* runHostnameExclusionPageScenarios:seededRows */
     SELECT
       (SELECT COUNT(*) FROM url_hostnames)::text AS hostname_count,
       (SELECT COUNT(*) FROM referral_program_topics)::text AS referral_program_topic_count`,
  )
  const hostnameRowCount = Number(rows[0]?.hostname_count)
  const referralProgramTopicRowCount = Number(rows[0]?.referral_program_topic_count)
  if (!Number.isSafeInteger(hostnameRowCount) || hostnameRowCount < 1)
    throw new Error('Hostname exclusion scenarios need a valid url_hostnames row count')
  if (!Number.isSafeInteger(referralProgramTopicRowCount) || referralProgramTopicRowCount < 1)
    throw new Error('Hostname exclusion scenarios need a valid referral_program_topics row count')

  for (const { scenarioId, maxProcessedRows, includeReferralProgramTopics } of [
    {
      scenarioId: 'hostname-exclusion-post-feed',
      maxProcessedRows: 3_217,
      includeReferralProgramTopics: false,
    },
    {
      scenarioId: 'hostname-exclusion-post-search',
      maxProcessedRows: 2_815,
      includeReferralProgramTopics: false,
    },
    {
      scenarioId: 'hostname-exclusion-referral-links',
      maxProcessedRows: 363_006,
      includeReferralProgramTopics: true,
    },
  ]) {
    registerScenarioContract(scenarioId, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['url_hostnames_pkey'] },
        { kind: 'maxProcessedRows', relation: 'url_hostnames', max: maxProcessedRows },
      ],
      seededRows: {
        url_hostnames: hostnameRowCount,
        ...(includeReferralProgramTopics
          ? { referral_program_topics: referralProgramTopicRowCount }
          : {}),
      },
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
