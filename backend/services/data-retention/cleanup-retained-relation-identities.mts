import { beginTransaction } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import {
  electedRelationMetadata,
  getElectedRelationTargetColumn,
} from '@services/users/relation-impact-targets'

export type RetainedRelationIdentityCleanupPage = {
  relationTable: string
  scanned: number
  deleted: number
  hasMore: boolean
}

export type RetainedRelationIdentityKey = { subjectId: string; relationId: string }

/** Each elected relation has a separate bounded cursor and transaction. */
export async function cleanupRetainedRelationIdentities(
  pageSize = 1_000,
  keysByTable?: Readonly<Record<string, readonly RetainedRelationIdentityKey[]>>,
): Promise<RetainedRelationIdentityCleanupPage[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new RangeError('Retained relation cleanup page size must be between 1 and 1000')
  }
  const pages: RetainedRelationIdentityCleanupPage[] = []
  for (const metadata of electedRelationMetadata) {
    const keys = keysByTable?.[metadata.table_name]
    if (keysByTable && !keys?.length) continue
    if (keys && keys.length > pageSize)
      throw new RangeError('Scoped retained relation cleanup must fit one page')
    // A scoped tuple is owned by its subject and relation ids; no keys is the global default.
    observeSharedDbScope(
      'cleanupRetainedRelationIdentities',
      sharedDbIdsScope(keys?.flatMap(key => [key.subjectId, key.relationId])),
    )
    // oxlint-disable-next-line no-await-in-loop -- each concrete family owns an independent bounded transaction.
    pages.push(await cleanupRelationFamily(metadata.table_name, pageSize, keys))
  }
  return pages
}

async function cleanupRelationFamily(
  relationTable: string,
  pageSize: number,
  keys?: readonly RetainedRelationIdentityKey[],
): Promise<RetainedRelationIdentityCleanupPage> {
  const metadata = electedRelationMetadata.find(item => item.table_name === relationTable)!
  const owner = `retained_${metadata.table_name}`
  const targetColumn = getElectedRelationTargetColumn(relationTable)
  await using query = await beginTransaction()
  const cursor = keys
    ? null
    : (
        await query<{
          cursor_subject_id: string | null
          cursor_relation_id: string | null
        }>(
          `/* lockRetainedRelationCleanupProgress */
           SELECT cursor_subject_id, cursor_relation_id
           FROM retained_relation_identity_cleanup_progress
           WHERE relation_table = $1 FOR UPDATE`,
          [relationTable],
        )
      ).rows[0]
  if (!keys && !cursor)
    throw new Error(`Missing retained relation cleanup cursor: ${relationTable}`)
  const { rows: candidates } = await query<{ subject_id: string; id: string }>(
    `/* listRetainedRelationCleanupCandidates */
     SELECT candidate.subject_id, candidate.id FROM ${owner} candidate
     WHERE ($1::uuid[] IS NOT NULL AND EXISTS (
       SELECT 1 FROM UNNEST($1::uuid[], $2::uuid[]) owned(subject_id, relation_id)
       WHERE owned.subject_id = candidate.subject_id AND owned.relation_id = candidate.id
     )) OR ($1::uuid[] IS NULL AND ($3::uuid IS NULL OR (candidate.subject_id, candidate.id) > ($3::uuid, $4::uuid)))
     ORDER BY candidate.subject_id, candidate.id LIMIT $5`,
    [
      keys?.map(key => key.subjectId) ?? null,
      keys?.map(key => key.relationId) ?? null,
      cursor?.cursor_subject_id ?? null,
      cursor?.cursor_relation_id ?? null,
      pageSize + 1,
    ],
  )
  const page = candidates.slice(0, pageSize)
  const { rowCount } = await query(
    `/* deleteUnreferencedRetainedRelationPage */
     WITH locked AS MATERIALIZED (
       SELECT owner.subject_id, owner.id FROM ${owner} owner
       JOIN UNNEST($1::uuid[], $2::uuid[]) candidate(subject_id, relation_id)
         ON candidate.subject_id = owner.subject_id AND candidate.relation_id = owner.id
       ORDER BY owner.subject_id, owner.id FOR UPDATE OF owner SKIP LOCKED
     )
     DELETE FROM ${owner} target USING locked
     WHERE target.subject_id = locked.subject_id AND target.id = locked.id
       AND NOT EXISTS (
         SELECT 1 FROM user_deletion_relation_impacts impact
         WHERE impact.subject_id = locked.subject_id AND impact.${targetColumn} = locked.id
       )`,
    [page.map(item => item.subject_id), page.map(item => item.id)],
  )
  const hasMore = candidates.length > pageSize
  const last = hasMore ? page.at(-1)! : null
  if (!keys)
    await query(
      `/* checkpointRetainedRelationCleanup */
       UPDATE retained_relation_identity_cleanup_progress
       SET cursor_subject_id = $2, cursor_relation_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE relation_table = $1`,
      [relationTable, last?.subject_id ?? null, last?.id ?? null],
    )
  await query.commit()
  return { relationTable, scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
