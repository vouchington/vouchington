import { getMembershipWorkLimit } from '@services/memberships/work-limits'
import { read } from '@data-stores/psql'
import type {
  AppleNotificationRecoveryCursor,
  RecoverAppleNotificationsData,
} from '@queues/memberships/types'
import sql from 'sql-template-strings'
import type { AppleMembershipProviderEnvironment } from './types.mts'

export type RecoverableAppleNotification = {
  evidenceId: string
  providerLineageId: string
  environment: AppleMembershipProviderEnvironment
}

export async function findRecoverableAppleNotificationJobs(
  input: RecoverAppleNotificationsData & {
    evidenceIds?: readonly string[]
    batchSize?: number
  } = {},
): Promise<{
  notifications: RecoverableAppleNotification[]
  through: AppleNotificationRecoveryCursor | null
  nextCursor: AppleNotificationRecoveryCursor | null
  hasMore: boolean
  inspected: number
}> {
  const through =
    input.through ?? (await findAppleNotificationRecoveryUpperBound(input.evidenceIds))
  if (!through)
    return { notifications: [], through: null, nextCursor: null, hasMore: false, inspected: 0 }
  const batchSize = input.batchSize ?? getMembershipWorkLimit('notification_recovery_batch_size')
  const statement = sql`/* findRecoverableAppleNotificationJobs */
    SELECT evidence.id, to_char(evidence.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_at_cursor,
      (SELECT provider FROM membership_provider_contexts
        WHERE id = evidence.membership_provider_context_id) AS provider,
      (SELECT provider_lineage_id FROM membership_provider_lineages
        WHERE id = evidence.membership_provider_lineage_id) AS provider_lineage_id,
      (SELECT environment FROM membership_provider_contexts
        WHERE id = evidence.membership_provider_context_id) AS environment
    FROM membership_provider_evidence_records evidence
    WHERE evidence.provider_event_id IS NOT NULL
      AND evidence.verified_at IS NULL AND evidence.rejected_at IS NULL
      AND (evidence.received_at, evidence.id) <= (${through.receivedAt}::timestamptz, ${through.evidenceId}::uuid)`
  if (input.after)
    statement.append(
      sql` AND (evidence.received_at, evidence.id) > (${input.after.receivedAt}::timestamptz, ${input.after.evidenceId}::uuid)`,
    )
  if (input.evidenceIds !== undefined)
    statement.append(sql` AND evidence.id = ANY(${input.evidenceIds}::uuid[])`)
  statement.append(sql` ORDER BY evidence.received_at, evidence.id LIMIT ${batchSize + 1}`)
  const { rows } = await read<{
    id: string
    received_at_cursor: string
    provider: string
    provider_lineage_id: string | null
    environment: AppleMembershipProviderEnvironment
  }>(statement)
  const inspected = rows.slice(0, batchSize)
  const last = inspected.at(-1)
  const hasMore = rows.length > batchSize && last !== undefined
  return {
    notifications: inspected.flatMap(row =>
      row.provider === 'apple_app_store' && row.provider_lineage_id !== null
        ? [
            {
              evidenceId: row.id,
              providerLineageId: row.provider_lineage_id,
              environment: row.environment,
            },
          ]
        : [],
    ),
    through,
    nextCursor:
      hasMore && last ? { receivedAt: last.received_at_cursor, evidenceId: last.id } : null,
    hasMore,
    inspected: inspected.length,
  }
}

export async function findAppleNotificationRecoveryUpperBound(
  evidenceIds?: readonly string[],
): Promise<AppleNotificationRecoveryCursor | null> {
  const statement = sql`/* findAppleNotificationRecoveryUpperBound */
    SELECT id AS "evidenceId", to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt"
    FROM membership_provider_evidence_records
    WHERE provider_event_id IS NOT NULL AND verified_at IS NULL AND rejected_at IS NULL`
  if (evidenceIds !== undefined) statement.append(sql` AND id = ANY(${evidenceIds}::uuid[])`)
  statement.append(sql` ORDER BY received_at DESC, id DESC LIMIT 1`)
  const { rows } = await read<AppleNotificationRecoveryCursor>(statement)
  return rows[0] ?? null
}
