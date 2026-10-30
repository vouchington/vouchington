import { read, write } from '@data-stores/psql'
import { isFirstCommunityPost } from '@services/communities/ban-evasion'
import { copyExistingEmbeddings } from '@services/bedrock-embeddings-batch/orchestrator/reconcile-existing'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runEmbeddingReconciliationScenarios(): Promise<void> {
  const { rows: posts } = await read<{ id: string; community_id: string; created_by_id: string }>(
    `/* explainFirstCommunityPostBoundary */
     WITH seeded_author_community AS (
       SELECT community_id, created_by_id FROM posts WHERE id = $1
     )
     SELECT posts.id, posts.community_id, posts.created_by_id
     FROM posts
     JOIN seeded_author_community seeded
       ON posts.community_id = seeded.community_id
       AND posts.created_by_id = seeded.created_by_id
     WHERE posts.deleted_at IS NULL
     ORDER BY posts.id
     LIMIT 1`,
    [seedUuid(5, '05')],
  )
  const post = posts[0]
  if (!post?.community_id || !post.created_by_id) {
    throw new Error('Missing seeded community post for first-post lookup')
  }
  registerScenarioContract('first-community-post-id-index', {
    expectations: [{ kind: 'custom', name: 'embeddingFirstPost' }],
    crossPartition: {
      posts: 'The first-post lookup checks an author and community across post id ranges.',
    },
  })
  await runAndCapture('first-community-post-id-index', async () => {
    const first = await isFirstCommunityPost(post.community_id, post.created_by_id, post.id)
    if (!first) throw new Error('Selected post must be the first live post in its community')
  })
  for (const tableName of ['topics', 'posts', 'rss_feed_items'] as const) {
    // This cohort leaves 20 sparse mismatches in a mostly matching production-sized table.
    // no-mistakes-disable-next-line query-reached-per-item: three fixed corpus relations need distinct bounded fixture pages.
    await markEmbeddingCorpusMatched(tableName)
    // no-mistakes-disable-next-line query-reached-per-item: one set-based sparse mismatch update per fixed relation.
    await write(
      `/* seedExplainEmbeddingMismatch:sparse */
       UPDATE ${tableName} SET bedrock_nova_multimodal_v1_input_sha256 = NULL
       WHERE id IN (SELECT id FROM ${tableName}
         WHERE bedrock_nova_multimodal_v1_content_sha256 IS NOT NULL
         ORDER BY id LIMIT 20)`,
    )
    // no-mistakes-disable-next-line query-reached-per-item: one set-based cache fixture per fixed relation.
    await write(
      `/* seedExplainEmbeddingMismatch:cache */
       INSERT INTO bedrock_nova_multimodal_v1_embeddings (content_sha256, embedding)
       SELECT bedrock_nova_multimodal_v1_content_sha256,
         ('[' || repeat('0,', 1023) || '0]')::vector
       FROM ${tableName}
       WHERE bedrock_nova_multimodal_v1_input_sha256 IS NULL
         AND bedrock_nova_multimodal_v1_content_sha256 IS NOT NULL
       ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING`,
    )
    // no-mistakes-disable-next-line query-reached-per-item: refresh changed relation stats before each separate plan.
    await write(`/* seedExplainEmbeddingMismatch:analyze */
        ANALYZE ${tableName}, bedrock_nova_multimodal_v1_embeddings`)
    registerScenarioContract(`bedrock-copy-existing-${tableName}`, {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes:
            tableName === 'topics'
              ? ['idx_topics__bedrock_nova_multimodal_v1_to_update']
              : tableName === 'posts'
                ? ['idx_posts__bedrock_nova_multimodal_v1_to_update', 'posts__default_id_idx1']
                : [
                    'idx_rss_feed_items__bedrock_nova_multimodal_v1_to_update',
                    'rss_feed_items_default_id_idx',
                  ],
          anyOf: tableName !== 'topics',
          queryContains: 'copyExistingEmbeddings candidates',
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: tableName, max: 40 },
      ],
      seededRows: {
        [tableName]:
          tableName === 'posts' ? 100_000 : tableName === 'rss_feed_items' ? 25_000 : 2500,
      },
      ...(tableName !== 'topics' && {
        crossPartition: {
          [tableName]:
            'The mismatch reconciliation walks a fixed ID keyset across retained ranges.',
        },
      }),
    })
    let updatedIds: string[] = []
    // no-mistakes-disable-next-line query-reached-per-item: three fixed production table variants each require their own EXPLAIN plan.
    await runAndCapture(
      `bedrock-copy-existing-${tableName}`,
      async () => {
        updatedIds = (await copyExistingEmbeddings(tableName, { limit: 10 })).updatedIds
      },
      undefined,
      [
        'copyExistingEmbeddings candidates',
        'copyExistingEmbeddings lockRows',
        'copyExistingEmbeddings',
      ],
      {
        afterCapture: async () => {
          if (updatedIds.length < 1 || updatedIds.length > 10)
            throw new Error(`Expected a bounded cached ${tableName} embedding copy`)
          await write(
            `/* seedExplainEmbeddingMismatch:rearm */
               UPDATE ${tableName} SET bedrock_nova_multimodal_v1_input_sha256 = NULL
               WHERE id = ANY($1::uuid[])`,
            [updatedIds],
          )
        },
      },
    )
  }
}

/** Fixed maximum of 21 physical 5k-row pages for the 100k-post EXPLAIN corpus. */
async function markEmbeddingCorpusMatched(tableName: 'topics' | 'posts' | 'rss_feed_items') {
  const pages = tableName === 'posts' ? 21 : tableName === 'rss_feed_items' ? 6 : 1
  for (let page = 0; page < pages; page++) {
    // no-mistakes-disable-next-line query-reached-per-item: at most 21 fixed 5k-row fixture pages avoid one statement deadline.
    const { rowCount } = await write(
      `/* seedExplainEmbeddingMismatch:matchedPage */
       WITH candidates AS (
         SELECT id FROM ${tableName}
         WHERE bedrock_nova_multimodal_v1_content_sha256 IS NOT NULL
           AND (bedrock_nova_multimodal_v1_input_sha256 IS NULL OR
             bedrock_nova_multimodal_v1_input_sha256 != bedrock_nova_multimodal_v1_content_sha256)
         ORDER BY id LIMIT 5000
       ) UPDATE ${tableName} target
       SET bedrock_nova_multimodal_v1_input_sha256 = target.bedrock_nova_multimodal_v1_content_sha256
       FROM candidates WHERE target.id = candidates.id`,
    )
    if ((rowCount ?? 0) < 5000) break
  }
}
