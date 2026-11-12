import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'
import { PostSeedDiagnostics, type SeedBackend } from './post-diagnostics.mts'

export async function seedPosts(
  count = 10_000,
  startIndex = 0,
  postTypeForIndex: (
    index: number,
  ) => 'discussion' | 'review' | 'data_point' | 'topic_recommendation' = index =>
    index % 3 === 0 ? 'discussion' : index % 3 === 1 ? 'review' : 'data_point',
  idForIndex: (index: number) => string = index => seedUuid(index, '05'),
): Promise<void> {
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
        const postIds: string[] = []
        const postTypes: string[] = []
        const titles: string[] = []
        const markdowns: string[] = []
        const userIds: string[] = []
        const hashes: Buffer[] = []
        const verticals: (string | null)[] = []
        const structuredDataValues: (string | null)[] = []
        for (let j = 0; j < batch; j++) {
          const idx = startIndex + i + j
          const id = idForIndex(idx)
          const userId = seedUuid(idx % 20_000, '01')
          const postType = postTypeForIndex(idx)
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
          postIds.push(id)
          postTypes.push(postType)
          titles.push(title)
          markdowns.push(markdown)
          userIds.push(userId)
          hashes.push(hash)
          verticals.push(dataPointVertical)
          structuredDataValues.push(structuredData)
        }
        await diagnostics.operation('insert', batchIndex, () =>
          query(
            `/* seedExplainData */ INSERT INTO posts (
          created_via, id, post_type, title, markdown, created_by_id,
          gemini_embedding_2_content_sha256,
          llm_moderation_content_sha256,
          data_point_vertical, structured_data
        , bedrock_nova_multimodal_v1_content_sha256) SELECT 'system', id, post_type, title, markdown, author_id,
            hash, hash, vertical, data
          , hash FROM UNNEST($1::uuid[], $2::post_types[], $3::text[], $4::text[],
            $5::uuid[], $6::bytea[], $7::text[], $8::jsonb[])
            WITH ORDINALITY AS seed (
              id, post_type, title, markdown, author_id, hash, vertical, data, ordinal
            )
          WHERE TRUE ORDER BY ordinal ON CONFLICT DO NOTHING`,
            [
              postIds,
              postTypes,
              titles,
              markdowns,
              userIds,
              hashes,
              verticals,
              structuredDataValues,
            ],
          ),
        )
        await diagnostics.operation('clearance', batchIndex, () =>
          query(
            `/* seedExplainData */
             WITH seed_posts AS (SELECT UNNEST($1::uuid[]) AS post_id),
             inserted_change AS (
               INSERT INTO post_clearance_changes (post_id, change_type, metadata)
               SELECT seed_posts.post_id, 'approve', '{"source":"explain-seed"}'::jsonb
               FROM seed_posts JOIN posts ON posts.id = seed_posts.post_id
               WHERE posts.approved_at IS NULL AND posts.rejected_at IS NULL AND posts.in_review_at IS NULL
               RETURNING post_id, created_at, changed_by_id, public_reason_code, is_platform_override
             )
             UPDATE posts SET clearance_version = posts.clearance_version + 1,
               clearance_changed_at = inserted_change.created_at,
               clearance_changed_by_id = inserted_change.changed_by_id,
               clearance_public_reason_code = inserted_change.public_reason_code,
               clearance_is_platform_override = inserted_change.is_platform_override,
               approved_at = inserted_change.created_at, rejected_at = NULL, in_review_at = NULL
             FROM inserted_change WHERE posts.id = inserted_change.post_id`,
            [postIds],
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
