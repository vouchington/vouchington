import { beginTransaction, read, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

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
         created_by_id, approved_at, bedrock_nova_multimodal_v1_content_sha256,
         llm_moderation_content_sha256
       )
       SELECT input.id, 'system', CASE WHEN input.parent_id IS NULL THEN 'discussion'::post_types ELSE 'comment'::post_types END,
         'seeded partitioned comment', input.parent_id, input.root_id, $5::uuid,
         CASE WHEN input.approved THEN now() ELSE NULL END, $6, $6
       FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::boolean[]) AS input(id, parent_id, root_id, approved)
       ON CONFLICT DO NOTHING`,
      [ids, parentIds, rootIds, approved, seedUuid(0, '01'), hash],
    )
  }
}

export function partitionName(monthStart: number): string {
  const date = new Date(monthStart)
  return `posts__explain_4990_comment_page_${date.getUTCFullYear()}_${String(date.getUTCMonth() + 1).padStart(2, '0')}`
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
      `The EXPLAIN database has leftover #4990 comment partitions (${rows.map(row => row.relation_name).join(', ')}); clean the owned fixture partitions before rerunning.`,
    )
}

export async function dropCommentDescendantPartitions(names: readonly string[]): Promise<void> {
  if (names.length > 24 || new Set(names).size !== names.length)
    throw new Error('Refusing an unexpected #4990 partition inventory')
  for (const name of names) {
    if (!/^posts__explain_4990_comment_page_\d{4}_\d{2}$/.test(name))
      throw new Error(`Refusing to drop unexpected #4990 partition name: ${name}`)
  }

  // The fixture owns at most 1.4 million posts across 24 future-month leaves. A descending
  // 5,000-id batch removes children before parents (posts enforces child.id > parent.id), so its
  // self-referencing ON DELETE CASCADE cannot silently turn one batch into a whole-tree delete.
  // These fixed operational fixture bounds are not live-service DynamicConfig tunables.
  const batchSize = 5_000
  let remainingBatches = 400
  for (const name of names.toSorted().toReversed()) {
    // A prior interrupted cleanup may already have detached or dropped an owned leaf.
    // no-mistakes-disable-next-line query-reached-per-item: inspect only the validated, fixed #4990 partition inventory
    const { rows: present } = await write<{ exists: boolean }>(
      `/* dropCommentDescendantPartition:exists */ SELECT to_regclass($1) IS NOT NULL AS exists`,
      [name],
    )
    if (!present[0]?.exists) continue

    let empty = false
    while (remainingBatches > 0) {
      remainingBatches -= 1
      await using transaction = await beginTransaction()
      // no-mistakes-disable-next-line query-reached-per-item: each iteration deletes at most 5,000 highest owned ids from one validated fixture leaf
      const { rows: cohort } = await transaction<{ id: string }>(
        `/* dropCommentDescendantPartition:posts */
         WITH doomed AS MATERIALIZED (
           SELECT id FROM ${name} ORDER BY id DESC LIMIT $1
         ), deleted AS (
           DELETE FROM ${name} p USING doomed WHERE p.id = doomed.id RETURNING p.id
         )
         SELECT doomed.id, completed.deleted_count
         FROM doomed CROSS JOIN (SELECT COUNT(*) AS deleted_count FROM deleted) completed`,
        [batchSize],
      )
      if (cohort.length > 0) {
        // A parent can cascade-delete a selected child before that child's DELETE target runs.
        // Use the materialized selected cohort so its identity is still removed. A canonical
        // inbound reference makes this transaction fail without weakening its FK.
        // no-mistakes-disable-next-line query-reached-per-item: remove only this bounded owned cohort's identities after its live posts have been deleted
        await transaction(
          `/* dropCommentDescendantPartition:identities */
           DELETE FROM retained_post_identities WHERE id = ANY($1::uuid[])`,
          [cohort.map(row => row.id)],
        )
      }
      await transaction.commit()
      if (cohort.length === 0) {
        empty = true
        break
      }
    }
    if (!empty) throw new Error('The bounded #4990 fixture cleanup exhausted its 400-batch cap')

    // Detach only after the leaf is empty, preserving every canonical inbound FK. If PostgreSQL
    // refuses the detach, leave its constraints and the owned empty leaf in place for inspection.
    // no-mistakes-disable-next-line query-reached-per-item: inspect only the validated, fixed #4990 partition inventory
    const { rows: attachment } = await write<{ attached: boolean }>(
      `/* dropCommentDescendantPartition:attached */
       SELECT EXISTS (
         SELECT 1 FROM pg_inherits WHERE inhrelid = $1::regclass AND inhparent = 'posts'::regclass
       ) AS attached`,
      [name],
    )
    if (attachment[0]?.attached) {
      // no-mistakes-disable-next-line query-reached-per-item: detach only the validated, empty #4990 fixture leaf
      await write(
        `/* dropCommentDescendantPartition:detach */ ALTER TABLE posts DETACH PARTITION ${name}`,
      )
    }
    // no-mistakes-disable-next-line query-reached-per-item: drop only the validated, detached, empty #4990 fixture leaf
    await write(`/* dropCommentDescendantPartition:drop */ DROP TABLE ${name}`)
  }
  await write(
    `/* dropCommentDescendantPartitions:analyze */ ANALYZE posts, retained_post_identities`,
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
