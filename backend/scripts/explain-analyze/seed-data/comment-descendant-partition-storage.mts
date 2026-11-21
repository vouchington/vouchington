import { beginTransaction, read } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

export interface CommentRow {
  id: string
  parentId: string | null
  rootId: string | null
  monthIndex?: number
  approved?: boolean
}

export async function insertCommentRows(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  rows: readonly CommentRow[],
  hash: Buffer,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 5_000) {
    const batch = rows.slice(offset, offset + 5_000)
    const ids = batch.map(row => row.id)
    const parentIds = batch.map(row => row.parentId)
    const rootIds = batch.map(row => row.rootId)
    const approved = batch.map(row => row.approved ?? true)
    // no-mistakes-disable-next-line query-reached-per-item: each chunk is a bounded set-based seed insert
    await query(
      `/* seedCommentDescendantPartition:posts */ INSERT INTO posts (
         id, created_via, post_type, markdown, parent_post_id, root_post_id,
         created_by_id, approved_at, gemini_embedding_2_content_sha256,
         llm_moderation_content_sha256
       , bedrock_nova_multimodal_v1_content_sha256)
       SELECT input.id, 'system', CASE WHEN input.parent_id IS NULL THEN 'discussion'::post_types ELSE 'comment'::post_types END,
         'seeded partitioned comment', input.parent_id, input.root_id, $5::uuid,
         CASE WHEN input.approved THEN now() ELSE NULL END, $6, $6
       , $6 FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::boolean[]) AS input(id, parent_id, root_id, approved)
       ON CONFLICT DO NOTHING`,
      [ids, parentIds, rootIds, approved, seedUuid(0, '01'), hash],
    )
  }
}

export function partitionName(monthStart: number): string {
  const date = new Date(monthStart)
  return `posts__explain_4990_comment_page_${date.getUTCFullYear()}_${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function createCommentPartitions(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  months: readonly number[],
): Promise<void> {
  for (const month of months) {
    const from = seedUuidAtTimestamp(month, 0)
    const to = seedUuidAtTimestamp(addUtcMonths(month, 1), 0)
    // no-mistakes-disable-next-line query-reached-per-item: create the fixed 24 monthly partitions in the isolated EXPLAIN database
    await query(
      `/* seedCommentDescendantPartition:partition */ CREATE TABLE IF NOT EXISTS ${partitionName(month)} PARTITION OF posts
       FOR VALUES FROM ('${from}'::uuid) TO ('${to}'::uuid)`,
    )
  }
}

export function logCommentFixturePhase(phase: string, startedAt: number): number {
  const now = performance.now()
  console.log(`Comment descendant fixture ${phase}: ${Math.round(now - startedAt)} ms`)
  return now
}

export async function assertNoLeftoverCommentPartitions(): Promise<void> {
  const { rows } = await read<{ relation_name: string }>(
    `/* assertNoLeftoverCommentPartitions */
     SELECT child.relname AS relation_name
     FROM pg_class child
     JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
     WHERE child_schema.nspname = current_schema()
       AND child.relname LIKE 'posts__explain_4990_comment_page_%'
       AND child.relkind IN ('r', 'p')
     LIMIT 25`,
  )
  if (rows.length > 0)
    throw new Error(
      `The EXPLAIN database has leftover #4990 comment partitions (${rows.map(row => row.relation_name).join(', ')}); recreate the isolated database through the dev workflow before rerunning.`,
    )
}

export function nextUtcMonthStart(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
}

export function addUtcMonths(monthStart: number, count: number): number {
  const date = new Date(monthStart)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1)
}
