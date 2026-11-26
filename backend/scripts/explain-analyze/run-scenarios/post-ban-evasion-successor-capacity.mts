import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { rearmNextPostBanEvasionEmbedding } from '@services/posts/ban-evasion-embeddings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser, heavyFollowUser } from '../run-support.mts'
import { postSeedTimestampMs, seedUuidAtTimestamp } from '../seed-data/common.mts'

const BACKGROUND_ROWS = 500
const MARKER = Buffer.alloc(32, 17)

export async function runPostBanEvasionSuccessorCapacity(): Promise<void> {
  const communityIds = [randomUUID(), randomUUID()]
  const tag = `explain-rearm-${communityIds[0]}`
  const time = postSeedTimestampMs(0) + 123_456
  const postIds = Array.from({ length: BACKGROUND_ROWS + 6 }, (_, n) =>
    seedUuidAtTimestamp(time + n, 4_500_000 + n),
  )
  const deletedId = postIds[0]!
  const successorId = postIds[4]!
  try {
    await write(
      `/* seedPostBanEvasionRearmCommunities */
      INSERT INTO communities (id, name, slug, created_by_id, created_via)
      SELECT id, $2, $2 || '-' || n, $3, 'system'
      FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n)`,
      [communityIds, tag, seedUser.id],
    )
    await write(
      `/* seedPostBanEvasionRearmPosts */
      INSERT INTO posts (id, created_by_id, community_id, post_type, created_via, title, markdown,
        deleted_at, llm_moderation_content_sha256, bedrock_nova_multimodal_v1_content_sha256,
        ban_evasion_post_embedding_input_sha256)
      SELECT id, CASE WHEN n = 3 THEN $4::uuid ELSE $3::uuid END,
        CASE WHEN n = 4 OR n > 6 THEN ($2::uuid[])[2] ELSE ($2::uuid[])[1] END,
        'discussion', 'system', $5, $5,
        CASE WHEN n <= 2 THEN CURRENT_TIMESTAMP END, $6, $6, $6
      FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n)`,
      [postIds, communityIds, seedUser.id, heavyFollowUser.id, tag, MARKER],
    )
    const scenario = 'post-ban-evasion-successor-rearm-at-cap'
    const query = 'rearmNextPostBanEvasionEmbedding'
    registerScenarioContract(scenario, {
      crossPartition: { posts: 'Deletion can rearm the immediate live post in a later partition.' },
      // UPDATE has no RETURNING. Verify the changed marker and surviving rows below.
      allowEmptyResult: true,
      // The community index can inspect two ineligible predecessors on its way to the successor.
      expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 5 }],
    })
    await runAndCapture(
      scenario,
      async () => {
        await using transaction = await beginTransaction()
        await rearmNextPostBanEvasionEmbedding(transaction, deletedId)
        const { rows } = await transaction<{ id: string; marker: Buffer | null }>(
          `/* inspectPostBanEvasionRearmMarkers */
          SELECT id, ban_evasion_post_embedding_input_sha256 AS marker
          FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id`,
          [postIds],
        )
        assert.deepEqual(
          rows.map(row => row.id),
          postIds,
        )
        assert.deepEqual(
          rows.filter(row => row.marker === null).map(row => row.id),
          [successorId],
        )
        assert(rows.every(row => row.id === successorId || row.marker?.equals(MARKER)))
        await transaction.rollback()
      },
      undefined,
      query,
      { exactCapturedNames: [query, 'inspectPostBanEvasionRearmMarkers'] },
    )
  } finally {
    await write(
      '/* cleanupPostBanEvasionRearmPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
      [postIds],
    )
    await write(
      '/* cleanupPostBanEvasionRearmCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
  }
}
