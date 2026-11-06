import { beginTransaction } from '@data-stores/psql'
import { v7 } from 'uuid'
import { contentHash, seedUuid } from './common.mts'
import { PostSeedDiagnostics, type SeedBackend } from './post-diagnostics.mts'

export async function seedPosts(count = 10_000): Promise<void> {
  console.log(`Seeding ${count} posts...`)
  const diagnostics = new PostSeedDiagnostics()
  try {
    await using transaction = await diagnostics.operation('begin', null, () => beginTransaction())
    const query = transaction
    const { rows: backendRows } = await diagnostics.operation('backend_context', null, () =>
      query<SeedBackend>(
        `/* explainSeedBackendPid */ SELECT pg_backend_pid() AS pid,
              current_setting('jit') AS jit,
              current_setting('work_mem') AS work_mem,
              current_setting('plan_cache_mode') AS plan_cache_mode,
              current_setting('server_version') AS server_version`,
      ),
    )
    diagnostics.startObserver(backendRows[0])
    for (let i = 0; i < count; i += 500) {
      const batchIndex = i / 500
      await diagnostics.operation('batch', batchIndex, async () => {
        const batch = Math.min(500, count - i)
        const values: unknown[] = []
        const rows: string[] = []
        const clearanceChangeIds = new Map<string, string>()
        for (let j = 0; j < batch; j++) {
          const idx = i + j
          const id = seedUuid(idx, '05')
          const clearanceChangeId = v7()
          const userId = seedUuid(idx % 20_000, '01')
          const postType = idx % 3 === 0 ? 'discussion' : idx % 3 === 1 ? 'review' : 'data_point'
          const title = `Seed Post ${idx}`
          const markdown = `Content for seed post ${idx}`
          const hash = contentHash(`post-${idx}`)
          const isDataPoint = postType === 'data_point'
          const dataPointVertical = isDataPoint ? 'credit_card' : null
          const structuredData = isDataPoint
            ? JSON.stringify({
                result: idx % 2 === 0 ? 'approved' : 'denied',
                credit_score_range: ['300-579', '580-669', '670-739', '740-799', '800-850'][
                  idx % 5
                ],
              })
            : null
          clearanceChangeIds.set(id, clearanceChangeId)
          values.push(
            id,
            postType,
            title,
            markdown,
            userId,
            hash,
            hash,
            dataPointVertical,
            structuredData,
            clearanceChangeId,
          )
          const base = values.length - 9
          rows.push(
            `('system', $${base}, $${base + 1}::post_types, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb, 1, uuid_extract_timestamp($${base + 9}::uuid), uuid_extract_timestamp($${base + 9}::uuid))`,
          )
        }
        const { rows: changedPosts } = await diagnostics.operation('insert', batchIndex, () =>
          query<{ id: string }>(
            `/* seedExplainData */ INSERT INTO posts (
          created_via, id, post_type, title, markdown, created_by_id,
          bedrock_nova_multimodal_v1_content_sha256,
          llm_moderation_content_sha256,
          data_point_vertical, structured_data, clearance_version,
          clearance_changed_at, approved_at
        ) VALUES ${rows.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          clearance_version = posts.clearance_version + 1,
          clearance_changed_at = EXCLUDED.clearance_changed_at,
          clearance_changed_by_id = NULL,
          clearance_public_reason_code = NULL,
          clearance_is_platform_override = FALSE,
          approved_at = EXCLUDED.approved_at,
          rejected_at = NULL,
          in_review_at = NULL
        WHERE posts.approved_at IS NULL AND posts.rejected_at IS NULL AND posts.in_review_at IS NULL
        RETURNING id`,
            values,
          ),
        )
        const changedPostIds = changedPosts.map(({ id }) => id)
        // The history author trigger must see the post, so append history in a separate statement.
        await diagnostics.operation('clearance', batchIndex, () =>
          query(
            `/* seedExplainData */ INSERT INTO post_clearance_changes
             (id, post_id, change_type, metadata)
             SELECT change_id, post_id, 'approve', '{"source":"explain-seed"}'::jsonb
             FROM UNNEST($1::uuid[], $2::uuid[]) AS changed(post_id, change_id)`,
            [changedPostIds, changedPostIds.map(id => clearanceChangeIds.get(id))],
          ),
        )
      })
      if (batchIndex === 0) {
        await diagnostics.operation('analyze_post_stats', batchIndex, () =>
          query('/* explainSeedPostStats */ ANALYZE retained_post_identities, posts'),
        )
      }
    }

    await diagnostics.operation('commit', null, () => transaction.commit())
  } finally {
    await diagnostics.stop()
  }
}
