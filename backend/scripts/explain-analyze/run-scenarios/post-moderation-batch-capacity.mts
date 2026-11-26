import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchPostModerationsByPostIds } from '@services/moderation/search-post-moderations'
import { getModerationWorkLimit } from '@services/moderation/work-limits'
import { paginationMaxima } from '@services/pagination/config'
import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp, postSeedTimestampMs } from '../seed-data/common.mts'
import {
  POST_MODERATION_HISTORY_CATALOG_SIZE,
  removePostModerationHistoryCatalog,
  seedPostModerationHistoryPage,
} from '../seed-data/post-moderation-history-page.mts'

export async function runPostModerationBatchCapacityScenario(): Promise<void> {
  const limit = getModerationWorkLimit('post_moderations_per_post')
  const postLimit = paginationMaxima.max_limit
  const postIds = Array.from({ length: postLimit + 1 }, (_, i) => seedUuid(2_700_000 + i, 'db'))
  const historyPerPost = limit + 2
  const agentIds = Array.from({ length: 10 }, (_, index) => seedUuid(2_600_000 + index, '36'))
  const timestamp = postSeedTimestampMs(0) - 95 * 24 * 60 * 60 * 1_000
  const historyIds = postIds.flatMap((_postId, postIndex) =>
    Array.from({ length: historyPerPost }, (_, i) =>
      seedUuidAtTimestamp(timestamp, 2_700_000 + postIndex * historyPerPost + i),
    ),
  )
  await seedPostModerationHistoryPage(seedUuid(2_500_000, 'da'))
  try {
    await write(
      `/* seedPostModerationBatchParents */
      INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
      SELECT id, $2::uuid, 'discussion', 'Moderation batch', 'Moderation batch', 'system',
        decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
      FROM unnest($1::uuid[]) AS requested(id)`,
      [postIds, seedUuid(0, '01')],
    )
    await write(
      `/* seedPostModerationBatchHistory */
      INSERT INTO agent_moderations (id, post_id, input_sha256, prompt_id, agent_id, results, is_flagged, deleted_at)
      SELECT id, ($2::uuid[])[1 + ((ordinal - 1) / $3)::int],
        decode(lpad(to_hex(ordinal), 64, '0'), 'hex'), $4::uuid,
        ($5::uuid[])[1 + ((ordinal - 1) % cardinality($5::uuid[]))::int], '{}'::jsonb, FALSE,
        CASE WHEN ordinal % $3 = 0 THEN now() ELSE NULL END
      FROM unnest($1::uuid[]) WITH ORDINALITY AS history(id, ordinal)`,
      [historyIds, postIds, historyPerPost, seedUuid(2_000_000, '35'), agentIds],
    )
    await write(
      '/* analyzePostModerationBatchCapacity */ ANALYZE agent_moderations, moderator_agents',
    )
    const requestedPostIds = postIds.slice(0, postLimit)
    const expected = requestedPostIds.flatMap((postId, postIndex) =>
      historyIds
        .slice(postIndex * historyPerPost + 1, (postIndex + 1) * historyPerPost - 1)
        .toReversed()
        .map(id => ({ id, post_id: postId })),
    )
    registerScenarioContract('post-moderation-batch-at-cap', {
      seededRows: {
        moderator_agents: MODERATOR_CONFIGS.length + POST_MODERATION_HISTORY_CATALOG_SIZE,
      },
      expectations: [],
    })
    await runAndCapture(
      'post-moderation-batch-at-cap',
      async () => {
        const rows = await searchPostModerationsByPostIds(requestedPostIds)
        assert.deepEqual(
          rows.map(({ id, post_id }) => ({ id, post_id })),
          expected,
        )
      },
      undefined,
      'searchPostModerationsByPostIds',
      { exactCapturedNames: ['searchPostModerationsByPostIds'] },
    )
  } finally {
    await write(
      '/* deletePostModerationBatchHistory */ DELETE FROM agent_moderations WHERE post_id = ANY($1::uuid[])',
      [postIds],
    )
    await write(
      '/* deletePostModerationBatchParents */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
      [postIds],
    )
    await removePostModerationHistoryCatalog()
  }
}
