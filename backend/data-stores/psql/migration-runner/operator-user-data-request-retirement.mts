import { beginBoundedTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { parseClassifierPartitionRange } from './classifier-partition-range.mts'
import { getPartitionDropAgeRefusal } from './partition-drop-guard.mts'
import {
  ATTEMPTS,
  REQUESTS,
  TABLES,
  readChildren,
  assertDefaults,
  attachedRangeCount,
  type RequestRangeInput,
} from './operator-user-data-request-partitions.mts'

/** Refuse retirement until every request is terminal and aged, with no export artifact or attempt key. */
export async function retireUserDataRequestRange(input: RequestRangeInput): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const candidate = {
    table: REQUESTS,
    partition: `${REQUESTS}__${range.nameSuffix}`,
    upperBound: range.toDate,
  }
  const refusal = getPartitionDropAgeRefusal(candidate, { minimumRetentionDays: 30 }, new Date())
  if (refusal) throw new Error(`Request history range retirement refused: ${refusal}`)
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 15_000,
  })
  await guardAndRetireUserDataRequestRange(query, input, new Date())
  await query.commit()
}

export async function guardAndRetireUserDataRequestRange(
  query: QueryExecutor,
  input: RequestRangeInput,
  referenceDate: Date,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const candidate = {
    table: REQUESTS,
    partition: `${REQUESTS}__${range.nameSuffix}`,
    upperBound: range.toDate,
  }
  await query(`/* retireUserDataRequestRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`)
  await query(`/* retireUserDataRequestRange:lockParents */
    LOCK TABLE ${REQUESTS}, ${ATTEMPTS} IN ACCESS EXCLUSIVE MODE NOWAIT`)
  const children = await readChildren(query, range.nameSuffix)
  assertDefaults(children)
  const attached = attachedRangeCount(children, range.nameSuffix, range.fromId, range.toId)
  if (attached === 0) return
  if (attached !== TABLES.length) throw new Error('Request history range is only partly attached')
  const refusal = getPartitionDropAgeRefusal(candidate, { minimumRetentionDays: 30 }, referenceDate)
  if (refusal) throw new Error(`Request history range retirement refused: ${refusal}`)
  const requestChild = `${REQUESTS}__${range.nameSuffix}`
  const attemptChild = `${ATTEMPTS}__${range.nameSuffix}`
  const cutoff = new Date(referenceDate.getTime() - 30 * 86_400_000)
  const { rows: unfinished } = await query(`/* retireUserDataRequestRange:unfinished */
    SELECT id FROM ${requestChild}
    WHERE completed_at IS NULL AND failed_at IS NULL ORDER BY id LIMIT 1`)
  if (unfinished.length) throw new Error('Request history range contains an unfinished export')
  const { rows: recent } = await query(
    `/* retireUserDataRequestRange:recent */
    SELECT id FROM ${requestChild}
    WHERE COALESCE(completed_at, failed_at) >= $1::timestamptz
    ORDER BY COALESCE(completed_at, failed_at), id LIMIT 1`,
    [cutoff],
  )
  if (recent.length) throw new Error('Request history range contains a recent terminal export')
  const { rows: artifacts } = await query(`/* retireUserDataRequestRange:artifacts */
    SELECT id FROM ${requestChild} WHERE s3_key IS NOT NULL ORDER BY id LIMIT 1`)
  if (artifacts.length) throw new Error('Request history range retains an S3 object key')
  const { rows: attempts } = await query(`/* retireUserDataRequestRange:attempts */
    SELECT request_id FROM ${attemptChild} ORDER BY request_id LIMIT 1`)
  if (attempts.length) throw new Error('Request history range retains S3 attempt keys')
  await query(`/* retireUserDataRequestRange:detachAttempts */
    ALTER TABLE ${ATTEMPTS} DETACH PARTITION ${attemptChild}`)
  await query(`/* retireUserDataRequestRange:dropAttempts */ DROP TABLE ${attemptChild}`)
  await query(`/* retireUserDataRequestRange:detachRequests */
    ALTER TABLE ${REQUESTS} DETACH PARTITION ${requestChild}`)
  await query(`/* retireUserDataRequestRange:dropRequests */ DROP TABLE ${requestChild}`)
}
