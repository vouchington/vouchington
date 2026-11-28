import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { groupByNotice } from './read-models-staff-group.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'
import { getCopyrightSweepLimits } from './work-limits.mts'

export async function selectStaffActionIntents(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  type Row = CopyrightStaffCase['action_intents'][number] & { copyright_notice_id: string }
  const rows: Row[] = []
  for await (const row of createAsyncGeneratorFromCursor<Row>(
    sql`/* getPendingCopyrightStaffCase:actionIntents */
      SELECT target.copyright_notice_id, target.id AS target_id, intent.id, intent.action, intent.state, intent.failure_message
      FROM copyright_notice_action_work_items intent
      JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = ANY(${noticeIds}::uuid[])
      ORDER BY intent.id ASC
    `,
    { client: query.client, batchSize: getCopyrightSweepLimits().batchSize },
  )) {
    rows.push(row)
  }
  return groupByNotice(rows)
}

export async function selectStaffDeliveryIntents(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  type Row = CopyrightStaffCase['delivery_intents'][number] & { copyright_notice_id: string }
  const rows: Row[] = []
  for await (const row of createAsyncGeneratorFromCursor<Row>(
    sql`/* getPendingCopyrightStaffCase:deliveryIntents */
      SELECT copyright_notice_id, id, delivery_kind, channel, state,
        attempt_count AS delivery_attempt_count
      FROM copyright_notice_delivery_work_items
      WHERE copyright_notice_id = ANY(${noticeIds}::uuid[])
      ORDER BY id ASC
    `,
    { client: query.client, batchSize: getCopyrightSweepLimits().batchSize },
  )) {
    rows.push(row)
  }
  return groupByNotice(rows)
}

export async function selectStaffEmailCorrespondence(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  type Row = CopyrightStaffCase['email_correspondence'][number] & { copyright_notice_id: string }
  const rows: Row[] = []
  for await (const row of createAsyncGeneratorFromCursor<Row>(
    sql`/* getPendingCopyrightStaffCase:emailCorrespondence */
      SELECT link.copyright_notice_id,
        link.correspondence_submission_id AS submission_id,
        link.correspondence_kind AS kind, link.correspondence_action AS action,
        link.correspondence_reviewed_at AS reviewed_at
      FROM copyright_notice_email_intake_notice_links link
      WHERE link.copyright_notice_id = ANY(${noticeIds}::uuid[])
        AND link.correspondence_action IN ('admitted', 'rejected')
      ORDER BY link.correspondence_reviewed_at ASC, link.id ASC
    `,
    { client: query.client, batchSize: getCopyrightSweepLimits().batchSize },
  )) {
    rows.push(row)
  }
  return groupByNotice(rows)
}
