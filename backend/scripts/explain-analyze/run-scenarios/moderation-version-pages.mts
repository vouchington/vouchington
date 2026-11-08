import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { reconcilePostModerationWork } from '@services/post-clearance'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getViewPostsHydrationContract } from '../view-posts-hydration-contract.mts'
import { getPostByAny } from '../run-services.mts'
import {
  DELETED_PARENT_MODERATION_POST_ID,
  deleteDeletedParentModerationVersion,
  seedDeletedParentModerationVersion,
} from './deleted-parent-page-seeds.mts'

export async function runModerationVersionPageScenarios(): Promise<void> {
  await seedDeletedParentModerationVersion()
  try {
    // Populate the same policy with unrelated versions so the requested-post path
    // cannot pass by scanning an almost-empty global policy cohort.
    const unrelatedPostIds = Array.from({ length: 64 }, (_, index) =>
      seedUuid(60_000 + index, '05'),
    )
    const { rows: unrelatedVersions } = await write<{ id: string }>(
      `/* seedRequestedModerationPolicyCohort */
       INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
       SELECT post.id, post.llm_moderation_content_sha256, $2
       FROM posts post WHERE post.id = ANY($1::uuid[])
       ON CONFLICT DO NOTHING RETURNING id`,
      [unrelatedPostIds, POST_MODERATION_POLICY_REVISION],
    )
    const historicalVersions: { id: string }[] = []
    try {
      const { rows } = await write<{ id: string }>(
        `/* seedRequestedModerationHistory */
       INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
       SELECT post.id,
         CASE WHEN ordinal <= 256 THEN post.llm_moderation_content_sha256
           ELSE decode(md5('obsolete:' || ordinal) || md5('obsolete:' || ordinal), 'hex') END,
         CASE WHEN ordinal <= 256 THEN 'explain-requested-old:' || ordinal ELSE $2 END
       FROM posts post CROSS JOIN generate_series(1, 512) ordinal WHERE post.id = $1
       ON CONFLICT DO NOTHING RETURNING id`,
        [DELETED_PARENT_MODERATION_POST_ID, POST_MODERATION_POLICY_REVISION],
      )
      historicalVersions.push(...rows)
      assert.equal(historicalVersions.length, 512)
      assert.equal(unrelatedVersions.length, unrelatedPostIds.length)
      await write('/* analyzeRequestedModerationPolicyCohort */ ANALYZE post_moderation_versions')
      registerScenarioContract(
        'post-by-slug-current-policy-noise',
        await getViewPostsHydrationContract('post-by-slug'),
      )
      await runAndCapture('post-by-slug-current-policy-noise', () => getPostByAny('seed-post-3'))
      const pageSize = 10
      const requestedPostIds = [DELETED_PARENT_MODERATION_POST_ID]
      registerScenarioContract('moderation-requested-posts-page', {
        expectations: [
          {
            kind: 'usesIndexes',
            indexes: [
              'idx_post_moderation_versions__content_policy_key',
              'post_moderation_versions_pkey',
            ],
          },
          {
            kind: 'maxProcessedRows',
            relation: 'post_moderation_versions',
            max: requestedPostIds.length * 2,
          },
          { kind: 'maxProcessedRows', relation: 'posts', max: requestedPostIds.length },
        ],
        crossPartition: {
          posts: 'Requested moderation versions reference exact post ids across retained ranges.',
        },
      })
      await runAndCapture(
        'moderation-requested-posts-page',
        () => reconcilePostModerationWork(pageSize, requestedPostIds),
        undefined,
        'reconcilePostModerationWork',
      )
    } finally {
      await write(
        '/* cleanupRequestedModerationPolicyCohort */ DELETE FROM post_moderation_versions WHERE id = ANY($1::uuid[])',
        [[...unrelatedVersions, ...historicalVersions].map(row => row.id)],
      )
      await write('/* analyzeCleanedModerationPolicyCohort */ ANALYZE post_moderation_versions')
    }
    registerScenarioContract('deleted-parent-moderation-versions', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [
            'idx_post_moderation_versions__content_policy_key',
            'post_moderation_versions_pkey',
          ],
        },
        { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 20 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 10 },
      ],
    })
    await runAndCapture(
      'deleted-parent-moderation-versions',
      () => reconcilePostModerationWork(10, [DELETED_PARENT_MODERATION_POST_ID]),
      undefined,
      'reconcilePostModerationWork',
    )
    registerScenarioContract('moderation-current-policy-page', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_post_moderation_versions__policy_revision__id'] },
        { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 20 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 20 },
      ],
      crossPartition: {
        posts: 'Current moderation versions reference exact post ids across retained ranges.',
      },
    })
    await runAndCapture(
      'moderation-current-policy-page',
      () => reconcilePostModerationWork(10),
      undefined,
      'reconcilePostModerationWork',
    )
  } finally {
    await deleteDeletedParentModerationVersion()
    await write('/* vacuumCleanedModerationHistory */ VACUUM (ANALYZE) post_moderation_versions')
  }
}
