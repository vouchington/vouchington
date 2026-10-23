import { beginTransaction, read } from '@data-stores/psql'
import {
  lockHostnameOwnership,
  lockHostnameOwnershipForUrls,
  lockTopicHostnameMutations,
} from '@services/urls-hostnames/ownership-lock'
import { runHostnameOwnershipSnapshotScenario } from './hostname-relation-policy.mts'
import { addAdditionalHostname } from '@services/topics/additional-hostnames'
import { setTopicHostnameLink } from '@services/topics/hostname-link'
import { getLockedTopicRecommendationApproval } from '@services/topic-recommendations/get-locked-topic-recommendation-approval'
import { disableAndHideSource } from '@services/rss-feeds/disable-and-hide-source'
import { prepareTopicHostnameCreation } from '@services/topics/prepare-topic-hostname-creation'
import { insertChildReferralLinkRows } from '@services/user-referral-program-links/create-child-write'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedHostnameIds, seedTopicId, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
export async function runHostnameOwnershipScenarios(): Promise<void> {
  registerScenarioContract('hostname-owner-lock-batch', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'url_hostnames', max: 6 }],
  })
  await runAndCapture(
    'hostname-owner-lock-batch',
    async () => {
      await using query = await beginTransaction()
      await lockHostnameOwnership(query, [
        seedHostnameIds[1]!,
        seedHostnameIds[0]!,
        seedHostnameIds[1]!,
      ])
    },
    undefined,
    'lockHostnameOwnership',
  )
  registerScenarioContract('hostname-owner-topic-lock', { expectations: [] })
  await runAndCapture(
    'hostname-owner-topic-lock',
    async () => {
      await using query = await beginTransaction()
      await lockTopicHostnameMutations(query, [seedTopicId, seedTopicId])
    },
    undefined,
    'lockTopicHostnameMutations',
  )
  await runHostnameOwnershipSnapshotScenario()
  registerScenarioContract('hostname-owner-url-ids', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'urls', max: 3 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 },
    ],
  })
  await runAndCapture(
    'hostname-owner-url-ids',
    async () => {
      await using query = await beginTransaction()
      await lockHostnameOwnershipForUrls(query, [seedUuid(0, '03'), seedUuid(1, '03')])
    },
    undefined,
    'getUrlHostnameOwnershipIds',
  )
  registerScenarioContract('hostname-owner-recommendation-fence', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_topic_recommendations', max: 2 },
      { kind: 'maxProcessedRows', relation: 'post_topic_recommendation_hostnames', max: 0 },
      { kind: 'maxProcessedRows', relation: 'post_topic_recommendation_landing_page_urls', max: 0 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 0 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 0 },
    ],
  })
  await runAndCapture(
    'hostname-owner-recommendation-fence',
    async () => {
      await using query = await beginTransaction()
      await getLockedTopicRecommendationApproval(seedUuid(3, '05'), { query })
    },
    undefined,
    ['lockTopicRecommendationForMutation', 'getLockedTopicRecommendationApproval'],
  )
  registerScenarioContract('hostname-owner-additional-claim', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 4 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 0 },
    ],
  })
  await runAndCapture(
    'hostname-owner-additional-claim',
    async () => {
      await using query = await beginTransaction()
      await addAdditionalHostname(seedTopicId, 'seed-host-1.example.com', seedUser.id, {
        query,
      }).catch((err: unknown) => {
        if ((err as { status?: number }).status !== 409) throw err
      })
    },
    undefined,
    'addAdditionalHostname',
  )
  registerScenarioContract('hostname-owner-primary-validation', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
    ],
  })
  await runAndCapture(
    'hostname-owner-primary-validation',
    async () => {
      await using query = await beginTransaction()
      await setTopicHostnameLink(seedTopicId, seedHostnameIds[0]!, { query }).catch(
        (err: unknown) => {
          if ((err as { status?: number }).status !== 409) throw err
        },
      )
    },
    undefined,
    'getTopicHostnameLinkValidation',
  )
  const { rows: feeds } = await read<{ id: string }>(
    `/* explainHostnameOwnershipFeed */ SELECT id FROM rss_feeds ORDER BY id LIMIT 1`,
  )
  if (!feeds[0]) throw new Error('Hostname lifecycle scenario needs a seeded feed')
  registerScenarioContract('hostname-owner-source-hide', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
    ],
  })
  await runAndCapture(
    'hostname-owner-source-hide',
    async () => {
      await using query = await beginTransaction()
      await disableAndHideSource(feeds[0]!.id, { query })
    },
    undefined,
    ['disableAndHideSource:topicId', 'disableAndHideSource:topic'],
  )
  const { rows: aliases } = await read<{ id: string; alias: string }>(
    `/* explainHostnameOwnershipAlias */ SELECT id, alias FROM topic_aliases WHERE topic_id = $1::uuid LIMIT 1`,
    [seedTopicId],
  )
  if (!aliases[0]) throw new Error('Hostname lifecycle scenario needs a seeded alias')
  registerScenarioContract('hostname-owner-revival-discovery', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 2 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
    ],
  })
  await runAndCapture(
    'hostname-owner-revival-discovery',
    async () => {
      await using query = await beginTransaction()
      await prepareTopicHostnameCreation(
        seedUser.id,
        { name: 'explain', slug: aliases[0]!.alias, source_topic_alias_id: aliases[0]!.id },
        { query },
      )
    },
    undefined,
    'getTopicRevivalHostnameOwner',
  )
  const { rows: parents } = await read<{ id: string }>(
    `/* explainHostnameOwnershipParent */ SELECT id FROM user_referral_program_links WHERE user_id = $1::uuid AND referral_program_topic_id = $2::uuid AND url_id = $3::uuid LIMIT 1`,
    [seedUuid(2, '01'), seedUuid(0, '09'), seedUuid(0, '03')],
  )
  if (!parents[0]) throw new Error('Child referral scenario needs a seeded parent')
  registerScenarioContract('hostname-owner-child-batch', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: 2 }],
  })
  await runAndCapture(
    'hostname-owner-child-batch',
    async () => {
      await using query = await beginTransaction()
      await insertChildReferralLinkRows(
        SYSTEM_PROVENANCE,
        [
          {
            userId: seedUuid(2, '01'),
            referralProgramId: seedUuid(0, '09'),
            urlId: seedUuid(1, '03'),
            parentLinkId: parents[0]!.id,
            label: null,
          },
        ],
        { query },
      )
    },
    undefined,
    'createChildReferralLinks',
  )
}
