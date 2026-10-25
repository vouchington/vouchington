/* oxlint-disable no-await-in-loop -- each bounded scope page checkpoints its own transaction. */
import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { assertPositiveInteger } from './normalize-positive-integer.mts'

type Scope = { classifier_id: string; prompt_version_id: string }
type PageResult = { scanned: number; deleted: number; hasMore: boolean }

/** Prompt-version scopes and identity IDs both advance by indexed keysets. */
export async function sweepClassifierVersionedIdentities(
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
  maxBatches: number,
): Promise<PageResult> {
  assertPositiveInteger(batchSize, 'batchSize')
  assertPositiveInteger(maxBatches, 'maxBatches')
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: at most maxBatches independent scope pages each read batchSize+1 indexed raw identity keys and commit a durable keyset cursor.
    const page = await sweepVersionPage(cutoffId, lowerBoundId, batchSize)
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}

async function nextPromptScope(
  query: OwnedTransaction,
  after: Scope | null,
): Promise<Scope | null> {
  const statement = sql`/* nextClassifierIdentityPromptScope */
    SELECT classifier_id, prompt_version_id FROM classifier_run_identities
    WHERE prompt_version_id IS NOT NULL`
  if (after) {
    statement.append(sql` AND (classifier_id, prompt_version_id) >
      (${after.classifier_id}::uuid, ${after.prompt_version_id}::uuid)`)
  }
  statement.append(sql` ORDER BY classifier_id, prompt_version_id LIMIT 1`)
  const { rows } = await query<Scope>(statement)
  return rows[0] ?? null
}

async function sweepVersionPage(
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
): Promise<PageResult> {
  await using query = await beginTransaction()
  await query(sql`/* ensureClassifierVersionIdentityCursor */
    INSERT INTO classifier_retention_cursors (sweep) VALUES ('versioned_identities')
    ON CONFLICT DO NOTHING`)
  const { rows: progress } = await query<{
    cursor_id: string | null
    cursor_classifier_id: string | null
    cursor_prompt_version_id: string | null
    sweep_start_key: string | null
    sweep_end_key: string | null
  }>(sql`/* lockClassifierVersionIdentityCursor */
    SELECT cursor_id, cursor_classifier_id, cursor_prompt_version_id,
      sweep_start_key, sweep_end_key
    FROM classifier_retention_cursors WHERE sweep = 'versioned_identities' FOR UPDATE`)
  const previous = progress[0]!
  const sweepEnd =
    previous.sweep_start_key === lowerBoundId &&
    previous.sweep_end_key !== null &&
    previous.sweep_end_key >= lowerBoundId &&
    previous.sweep_end_key <= cutoffId
      ? previous.sweep_end_key
      : cutoffId
  const continuing =
    previous.sweep_start_key === lowerBoundId && previous.sweep_end_key === sweepEnd
  const storedScope =
    continuing &&
    previous.cursor_classifier_id !== null &&
    previous.cursor_prompt_version_id !== null
      ? {
          classifier_id: previous.cursor_classifier_id,
          prompt_version_id: previous.cursor_prompt_version_id,
        }
      : null
  const scope = storedScope ?? (await nextPromptScope(query, null))
  let scanned = 0
  let deleted = 0
  let hasMore = false
  let checkpointScope: Scope | null = null
  let checkpointId: string | null = null
  if (scope) {
    const statement = sql`/* listClassifierVersionIdentityPage */
      SELECT id FROM classifier_run_identities
      WHERE classifier_id = ${scope.classifier_id}
        AND prompt_version_id = ${scope.prompt_version_id}
        AND id >= ${lowerBoundId} AND id < ${sweepEnd}`
    if (storedScope && previous.cursor_id !== null) {
      statement.append(sql` AND id > ${previous.cursor_id}`)
    }
    statement.append(sql` ORDER BY id LIMIT ${batchSize + 1}`)
    const { rows } = await query<{ id: string }>(statement)
    const page = rows.slice(0, batchSize)
    scanned = page.length
    if (page.length > 0) {
      deleted = await deleteOldVersionIdentities(
        query,
        page.map(row => row.id),
      )
    }
    if (rows.length > batchSize) {
      checkpointScope = scope
      checkpointId = page.at(-1)!.id
      hasMore = true
    } else {
      checkpointScope = await nextPromptScope(query, scope)
      hasMore = checkpointScope !== null
    }
  }
  await query(sql`/* checkpointClassifierVersionIdentityCursor */
    UPDATE classifier_retention_cursors SET
      cursor_classifier_id = ${checkpointScope?.classifier_id ?? null},
      cursor_prompt_version_id = ${checkpointScope?.prompt_version_id ?? null},
      cursor_id = ${checkpointId},
      sweep_start_key = ${hasMore ? lowerBoundId : null},
      sweep_end_key = ${hasMore ? sweepEnd : null}
    WHERE sweep = 'versioned_identities'`)
  await query.commit()
  return { scanned, deleted, hasMore }
}

async function deleteOldVersionIdentities(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteOldVersionClassifierIdentities */
    DELETE FROM classifier_run_identities identity
    WHERE identity.id = ANY(${[...ids]}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM classifier_runs run WHERE run.id = identity.id)
      AND EXISTS (
        SELECT 1 FROM classifier_prompt_versions newer
        WHERE newer.classifier_id = identity.classifier_id
          AND newer.id > identity.prompt_version_id
          AND newer.activated_at IS NOT NULL AND newer.deleted_at IS NULL
      )`)
  return rowCount ?? 0
}
