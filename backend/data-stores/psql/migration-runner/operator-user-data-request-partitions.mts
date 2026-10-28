import { beginBoundedTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import {
  parseClassifierPartitionRange,
  type ClassifierPartitionRangeInput,
} from './classifier-partition-range.mts'
import {
  REQUESTS,
  ATTEMPTS,
  TABLES,
  readChildren,
  assertDefaults,
  attachedRangeCount,
} from './operator-user-data-request-catalog.mts'

export type RequestRangeInput = ClassifierPartitionRangeInput
const REQUEST_COLUMNS = `id, user_id, requested_by_id, queued_at, processing_attempt_id,
  dispatched_at, processing_attempts, processing_started_at, completed_at, failed_at,
  last_error_message, s3_key, expires_at, updated_at`
const ATTEMPT_COLUMNS = `request_id, processing_attempt_id, started_at, updated_at,
  upload_lease_expires_at`

type RangeMove = {
  query: QueryExecutor
  range: ReturnType<typeof parseClassifierPartitionRange>
  requestChild: string
  attemptChild: string
}

/** Parent locks fence both DEFAULT moves and range retirement on the same connection. */
export async function lockRequestPartitionParents(
  query: QueryExecutor,
  operation: 'create' | 'retire',
): Promise<void> {
  if (operation === 'create') {
    await query(`/* createUserDataRequestRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`)
    await query(`/* createUserDataRequestRange:lockParents */
      LOCK TABLE ${REQUESTS}, ${ATTEMPTS} IN ACCESS EXCLUSIVE MODE NOWAIT`)
    return
  }
  await query(`/* retireUserDataRequestRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`)
  await query(`/* retireUserDataRequestRange:lockParents */
    LOCK TABLE ${REQUESTS}, ${ATTEMPTS} IN ACCESS EXCLUSIVE MODE NOWAIT`)
}

/** Split only a capped DEFAULT, moving requests and attempt keys atomically. */
export async function createUserDataRequestRange(input: RequestRangeInput): Promise<void> {
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 15_000,
  })
  await guardAndCreateUserDataRequestRange(query, input)
  await query.commit()
}

export async function guardAndCreateUserDataRequestRange(
  query: QueryExecutor,
  input: RequestRangeInput,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  await lockRequestPartitionParents(query, 'create')
  const children = await readChildren(query, range.nameSuffix)
  assertDefaults(children)
  const attached = attachedRangeCount(children, range.nameSuffix, range.fromId, range.toId)
  if (attached === TABLES.length) return
  if (attached !== 0) throw new Error('Request history range is only partly attached')

  // PostgreSQL validates the remaining DEFAULT when attaching the range. Bound that scan,
  // not only the rows copied into the new children.
  const { rows: defaultRows } = await query<{ parent_table: string }>(
    `/* createUserDataRequestRange:defaultBudget */
     SELECT '${REQUESTS}'::text AS parent_table FROM (
       SELECT id FROM ONLY ${REQUESTS}__default ORDER BY id LIMIT $1
     ) requests
     UNION ALL
     SELECT '${ATTEMPTS}'::text AS parent_table FROM (
       SELECT request_id FROM ONLY ${ATTEMPTS}__default ORDER BY request_id LIMIT $1
     ) attempts`,
    [range.maxDefaultRows + 1],
  )
  for (const table of TABLES) {
    if (defaultRows.filter(row => row.parent_table === table).length > range.maxDefaultRows)
      throw new Error(`Request history DEFAULT row cap exceeded for ${table}`)
  }

  const requestChild = `${REQUESTS}__${range.nameSuffix}`
  const attemptChild = `${ATTEMPTS}__${range.nameSuffix}`
  const move = { query, range, requestChild, attemptChild }
  await prepareRangeChildren(move)
  await sealRangeChildren(move)
}

async function prepareRangeChildren(move: RangeMove): Promise<void> {
  await createRangeChildren(move)
  await copyRangeRows(move)
}

async function sealRangeChildren(move: RangeMove): Promise<void> {
  await removeAndAttachRangeChildren(move)
  await restoreActiveClaims(move)
}

async function createRangeChildren({
  query,
  requestChild,
  attemptChild,
}: RangeMove): Promise<void> {
  await query(`/* createUserDataRequestRange:createRequests */
    CREATE TABLE ${requestChild} (LIKE ${REQUESTS} INCLUDING ALL)`)
  await query(`/* createUserDataRequestRange:createAttempts */
    CREATE TABLE ${attemptChild} (LIKE ${ATTEMPTS} INCLUDING ALL)`)
}

async function copyRangeRows({
  query,
  range,
  requestChild,
  attemptChild,
}: RangeMove): Promise<void> {
  await query(
    `/* createUserDataRequestRange:copyRequests */
    INSERT INTO ${requestChild} (${REQUEST_COLUMNS})
    SELECT ${REQUEST_COLUMNS} FROM ONLY ${REQUESTS}__default
    WHERE id >= $1::uuid AND id < $2::uuid`,
    [range.fromId, range.toId],
  )
  await query(
    `/* createUserDataRequestRange:copyAttempts */
    INSERT INTO ${attemptChild} (${ATTEMPT_COLUMNS})
    SELECT ${ATTEMPT_COLUMNS} FROM ONLY ${ATTEMPTS}__default
    WHERE request_id >= $1::uuid AND request_id < $2::uuid`,
    [range.fromId, range.toId],
  )
}

async function removeAndAttachRangeChildren(move: RangeMove): Promise<void> {
  await removeDefaultRows(move)
  await attachRangeChildren(move)
}

async function removeDefaultRows({ query, range }: RangeMove): Promise<void> {
  await query(
    `/* createUserDataRequestRange:deleteAttempts */
    DELETE FROM ONLY ${ATTEMPTS}__default
    WHERE request_id >= $1::uuid AND request_id < $2::uuid`,
    [range.fromId, range.toId],
  )
  await query(
    `/* createUserDataRequestRange:deleteRequests */
    DELETE FROM ONLY ${REQUESTS}__default
    WHERE id >= $1::uuid AND id < $2::uuid`,
    [range.fromId, range.toId],
  )
}

async function attachRangeChildren({
  query,
  range,
  requestChild,
  attemptChild,
}: RangeMove): Promise<void> {
  await query(`/* createUserDataRequestRange:attachRequests */
    ALTER TABLE ${REQUESTS} ATTACH PARTITION ${requestChild}
    FOR VALUES FROM ('${range.fromId}') TO ('${range.toId}')`)
  await query(`/* createUserDataRequestRange:attachAttempts */
    ALTER TABLE ${ATTEMPTS} ATTACH PARTITION ${attemptChild}
    FOR VALUES FROM ('${range.fromId}') TO ('${range.toId}')`)
}

async function restoreActiveClaims({ query, requestChild }: RangeMove): Promise<void> {
  // Deleting source request rows cascaded their active claims. Reestablish the exact claims
  // under the same parent locks; attached rows do not fire INSERT triggers retroactively.
  await query(`/* createUserDataRequestRange:restoreActiveClaims */
    INSERT INTO active_user_data_request_claims (user_id, requested_by_id, request_id)
    SELECT user_id, requested_by_id, id FROM ${requestChild}
    WHERE completed_at IS NULL AND failed_at IS NULL
      AND user_id IS NOT NULL AND requested_by_id IS NOT NULL`)
}
