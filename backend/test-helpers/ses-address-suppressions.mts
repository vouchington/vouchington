import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'
import { getTestRejectedSesRetentionDelete } from './notification-email-retention.mts'

export async function getTestRejectedUnfoldedSesRetentionDelete(
  query: TransactionQuery,
  eventId: string,
  cutoff: Date,
): Promise<unknown> {
  const client = query.client
  await client.query(
    `/* authorizeTestSesRetentionIds */ SELECT set_config('app.ses_bounce_retention_ids', $1, true)`,
    [eventId],
  )
  await client.query(
    `/* authorizeTestSesRetentionCutoff */ SELECT set_config('app.ses_bounce_retention_cutoff', $1, true)`,
    [cutoff.toISOString()],
  )
  return getTestRejectedSesRetentionDelete(query, eventId)
}

export async function getTestRejectedSesRetentionContextMutations(
  query: TransactionQuery,
  eventId: string,
  eventAt: Date,
  cutoff: Date,
): Promise<{ eventUpdate: unknown; unrelatedDelete: unknown }> {
  const client = query.client
  const auditId = v7({ msecs: eventAt.getTime() })
  await query(
    `/* insertTestUnrelatedAppendOnlyRevision */
     INSERT INTO dynamic_configuration_revisions
       (id, configuration_key, revision_type, changes)
     VALUES ($1, 'test_ses_retention_guard', 'create', '{}'::jsonb)`,
    [auditId],
  )
  await client.query(
    `/* authorizeTestSesRetentionMutationIds */
     SELECT set_config('app.ses_bounce_retention_ids', $1, true)`,
    [`${eventId},${auditId}`],
  )
  await client.query(
    `/* authorizeTestSesRetentionMutationCutoff */
     SELECT set_config('app.ses_bounce_retention_cutoff', $1, true)`,
    [cutoff.toISOString()],
  )
  let eventUpdate: unknown = null
  await client.query('/* testSesRetentionUpdateSavepoint */ SAVEPOINT ses_retention_mutation')
  try {
    await client.query(
      `/* rejectTestSesRetentionEventUpdate */
       UPDATE amazon_ses_bounce_events SET raw_message = '{"changed":true}'::jsonb WHERE id = $1`,
      [eventId],
    )
  } catch (err) {
    eventUpdate = err
  } finally {
    await client.query(
      '/* testSesRetentionUpdateRollback */ ROLLBACK TO SAVEPOINT ses_retention_mutation',
    )
  }
  let unrelatedDelete: unknown = null
  await client.query('/* testSesRetentionDeleteSavepoint */ SAVEPOINT ses_retention_mutation')
  try {
    await client.query(
      '/* rejectTestSesRetentionUnrelatedDelete */ DELETE FROM dynamic_configuration_revisions WHERE id = $1',
      [auditId],
    )
  } catch (err) {
    unrelatedDelete = err
  } finally {
    await client.query(
      '/* testSesRetentionDeleteRollback */ ROLLBACK TO SAVEPOINT ses_retention_mutation',
    )
  }
  return {
    eventUpdate,
    unrelatedDelete,
  }
}

export async function testSesRetentionSuppressionExists(
  query: TransactionQuery,
  eventId: string,
): Promise<boolean> {
  const emailAddress = `tests+${eventId}@voucha.ai`
  const { rows } = await query<{ exists: boolean }>(
    `/* testSesRetentionSuppressionExists */
     SELECT EXISTS (
       SELECT 1 FROM amazon_ses_address_suppressions WHERE email_address = $1
     ) AS exists`,
    [emailAddress],
  )
  return rows[0]!.exists
}

export async function getTestSesAddressSuppression(
  query: TransactionQuery,
  emailAddress: string,
): Promise<{
  first_event_at: Date
  first_notification_type: string
  latest_event_at: Date
  latest_notification_type: string
} | null> {
  const { rows } = await query<{
    first_event_at: Date
    first_notification_type: string
    latest_event_at: Date
    latest_notification_type: string
  }>(
    `/* getTestSesAddressSuppression */
     SELECT first_event_at, first_notification_type, latest_event_at, latest_notification_type
     FROM amazon_ses_address_suppressions WHERE email_address = $1`,
    [emailAddress.toLowerCase().trim()],
  )
  return rows[0] ?? null
}

export async function removeTestSesAddressSuppression(
  query: TransactionQuery,
  eventId: string,
): Promise<void> {
  await query(
    `/* removeTestSesAddressSuppression */
     DELETE FROM amazon_ses_address_suppressions WHERE email_address = $1`,
    [`tests+${eventId}@voucha.ai`],
  )
}
