import { invalidate } from '@services/entity-cache/invalidate'
import type { PrivateUser } from '@services/users/types'
import {
  beginTransaction,
  read,
  withTransactionOptions,
  write,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import assert from 'http-assert'
import { currentUserCanModifyFediverseInstanceIntegrationStatus } from './authorization.mts'

export type FediverseIntegrationStatus = 'pending' | 'approved' | 'blocked'

export type SetIntegrationStatusResult = 'updated' | 'noop'

export type FediverseInstanceIntegrationChange = {
  id: string
  topic_id: string
  integration_status: FediverseIntegrationStatus
  changed_by_id: string | null
  reason: string | null
  created_at: Date
}

export type SetIntegrationStatusInput = {
  topicId: string
  integrationStatus: FediverseIntegrationStatus
  reason?: string | null
}

function assertReason(reason: string | null | undefined): void {
  assert(reason === undefined || reason === null || reason.length <= 1000, 400, 'reason too long')
}

export async function getLatestIntegrationStatusChange(
  topicId: string,
  options: QueryOptions = {},
): Promise<FediverseInstanceIntegrationChange | null> {
  const { rows } = await read(
    `/* getLatestFediverseInstanceIntegrationStatusChange */
      SELECT id, topic_id, integration_status, changed_by_id, reason, created_at
      FROM fediverse_instance_integration_changes
      WHERE topic_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [topicId],
    options,
  )
  return (rows[0] as FediverseInstanceIntegrationChange | undefined) ?? null
}

async function insertChange(
  input: SetIntegrationStatusInput & { changedById: string | null },
  options: QueryOptions = {},
): Promise<void> {
  assertReason(input.reason)
  await write(
    `/* insertFediverseInstanceIntegrationStatusChange */
      INSERT INTO fediverse_instance_integration_changes
        (topic_id, integration_status, changed_by_id, reason)
      VALUES ($1, $2, $3, $4)`,
    [input.topicId, input.integrationStatus, input.changedById, input.reason ?? null],
    options,
  )
}

export async function setIntegrationStatusAsAdmin(
  currentUser: PrivateUser,
  input: SetIntegrationStatusInput,
  options: QueryOptions = {},
): Promise<SetIntegrationStatusResult> {
  assert(currentUserCanModifyFediverseInstanceIntegrationStatus(currentUser), 403, 'Forbidden')
  const run = async (query: TransactionQuery): Promise<SetIntegrationStatusResult> => {
    const { rows } = await query(
      `/* setFediverseInstanceIntegrationStatusAsAdmin:latest */
        SELECT integration_status
        FROM fediverse_instance_integration_changes
        WHERE topic_id = $1
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [input.topicId],
    )
    const latest = rows[0] as { integration_status: FediverseIntegrationStatus } | undefined
    if (latest?.integration_status === input.integrationStatus) return 'noop'
    await insertChange({ ...input, changedById: currentUser.id }, { query })
    return 'updated'
  }
  const result =
    options.query || options.client
      ? await withTransactionOptions(options, run)
      : await setIntegrationStatusInOwnedTransaction(run)
  if (result === 'updated' && !options.query && !options.client)
    await invalidate.topics(input.topicId)
  return result
}

async function setIntegrationStatusInOwnedTransaction(
  run: (query: TransactionQuery) => Promise<SetIntegrationStatusResult>,
): Promise<SetIntegrationStatusResult> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
