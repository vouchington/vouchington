import { write } from '@data-stores/psql'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { enqueueBulkStoryClusteringStrict } from '@queues/ai-agents/enqueues/story-clustering'
import sql from 'sql-template-strings'

const DEFAULT_RECOVERY_PAGE_SIZE = 100
const RECOVERY_CURSOR_SCOPE = 'stories:embedding-trigger:pending:id-asc'

type CurrentEmbedding = { id: string; input_sha256: Buffer }
type StoryTriggerDependencies = {
  enqueueStrict: typeof enqueueBulkStoryClusteringStrict
  markAccepted: (rows: CurrentEmbedding[]) => Promise<void>
}

/** A marker records queue acceptance for the exact current embedding input, not job completion. */
export async function triggerStoryClusteringForCurrentEmbeddings(
  itemIds: string[],
  dependencies: Partial<StoryTriggerDependencies> = {},
): Promise<number> {
  if (itemIds.length === 0) return 0
  const { rows } =
    await write<CurrentEmbedding>(sql`/* triggerStoryClusteringForCurrentEmbeddings */
    SELECT id, bedrock_nova_multimodal_v1_input_sha256 AS input_sha256
    FROM rss_feed_items
    WHERE id = ANY(${itemIds}::uuid[])
      AND deleted_at IS NULL
      AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
      AND bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
      AND (
        story_clustering_embedding_input_sha256 IS NULL
        OR story_clustering_embedding_input_sha256 != bedrock_nova_multimodal_v1_input_sha256
      )
    ORDER BY id
  `)
  if (rows.length === 0) return 0

  const acceptedIds = await (dependencies.enqueueStrict ?? enqueueBulkStoryClusteringStrict)(
    rows.map(row => ({
      rss_feed_item_id: row.id,
      inputSha256Hex: row.input_sha256.toString('hex'),
    })),
  )
  const accepted = new Set(acceptedIds)
  const acceptedRows = rows.filter(row => accepted.has(row.id))
  if (acceptedRows.length > 0) {
    await (dependencies.markAccepted ?? markStoryClusteringEmbeddingTriggerAccepted)(acceptedRows)
  }
  return acceptedRows.length
}

export async function reconcilePendingStoryClusteringEmbeddingTriggers(
  options: { after?: string; limit?: number } = {},
  dependencies: Partial<StoryTriggerDependencies> = {},
): Promise<{ enqueuedCount: number; scannedCount: number; nextCursor: string | null }> {
  const requestedLimit = options.limit ?? DEFAULT_RECOVERY_PAGE_SIZE
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new Error('Invalid story embedding recovery page size')
  }
  const limit = Math.min(requestedLimit, 100)
  const afterId =
    options.after !== undefined
      ? decodeScopedUuidCursor(
          options.after,
          RECOVERY_CURSOR_SCOPE,
          'Invalid story embedding cursor',
        ).id
      : null
  const candidateQuery = sql`/* reconcilePendingStoryClusteringEmbeddingTriggers */
    SELECT id FROM rss_feed_items
    WHERE deleted_at IS NULL
      AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
      AND bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
      AND (
        story_clustering_embedding_input_sha256 IS NULL
        OR story_clustering_embedding_input_sha256 != bedrock_nova_multimodal_v1_input_sha256
      )
  `
  if (afterId) candidateQuery.append(sql` AND id > ${afterId}::uuid`)
  candidateQuery.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows: candidates } = await write<{ id: string }>(candidateQuery)
  const scannedCount = candidates.length
  const nextCursor =
    scannedCount === limit
      ? encodeScopedUuidCursor(candidates[scannedCount - 1]!.id, RECOVERY_CURSOR_SCOPE)
      : null
  if (scannedCount === 0) return { enqueuedCount: 0, scannedCount, nextCursor }

  const enqueuedCount = await triggerStoryClusteringForCurrentEmbeddings(
    candidates.map(row => row.id),
    dependencies,
  )
  return { enqueuedCount, scannedCount, nextCursor }
}

async function markStoryClusteringEmbeddingTriggerAccepted(
  rows: CurrentEmbedding[],
): Promise<void> {
  const values = sql``
  rows.forEach((row, index) => {
    if (index > 0) values.append(sql`, `)
    values.append(sql`(${row.id}::uuid, ${row.input_sha256}::bytea)`)
  })
  await write(
    sql`/* markStoryClusteringEmbeddingTriggerAccepted */
    UPDATE rss_feed_items r
    SET story_clustering_embedding_input_sha256 = accepted.input_sha256
    FROM (VALUES `.append(values).append(sql`) AS accepted(item_id, input_sha256)
    WHERE r.id = accepted.item_id
      AND r.deleted_at IS NULL
      AND r.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND r.bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
      AND r.bedrock_nova_multimodal_v1_input_sha256 = accepted.input_sha256
      AND r.bedrock_nova_multimodal_v1_content_sha256 = accepted.input_sha256
      AND (
        r.story_clustering_embedding_input_sha256 IS NULL
        OR r.story_clustering_embedding_input_sha256 != accepted.input_sha256
      )
  `),
  )
}
