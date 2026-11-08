import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueContinueCriticalModerationAlertNotification,
} from '@queues/notifications/enqueues'
import {
  getNotificationRecipientDispatchPageHardMax,
  getNotificationRecipientDispatchPageLimit,
} from '@queues/notifications/enqueues/page-limits'

export async function createCriticalModerationAlertNotification(reportId: string): Promise<void> {
  const { nextAfterUserId } = await createCriticalModerationAlertNotificationPage(reportId, null)
  if (nextAfterUserId)
    await enqueueContinueCriticalModerationAlertNotification({
      reportId,
      afterUserId: nextAfterUserId,
    })
}

/** Processes one bounded staff page; later pages recheck current staff eligibility. */
export async function createCriticalModerationAlertNotificationPage(
  reportId: string,
  afterUserId: string | null,
  pageSize = getNotificationRecipientDispatchPageLimit(),
  recipientUserIds?: readonly string[],
): Promise<{ nextAfterUserId: string | null }> {
  if (!(await isCriticalAlertReportLive(reportId))) return { nextAfterUserId: null }
  const limit = getNotificationRecipientDispatchPageLimit()
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('Invalid alert page size')
  const effectivePageSize = Math.min(pageSize, limit)
  const { recipientIds, nextAfterUserId } = await listCriticalAlertRecipientPage(
    afterUserId,
    effectivePageSize,
    write,
    recipientUserIds,
  )
  const created = await insertCriticalAlertNotifications(reportId, recipientIds)
  if (created.length > 0)
    await enqueueBulkDeliverNotificationPushIntents(
      created.map(row => ({ userId: row.user_id, notificationId: row.id })),
    )
  return { nextAfterUserId }
}

/** A continuation finishes when its report was removed after root admission. */
export async function isCriticalAlertReportLive(
  reportId: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(sql`/* isCriticalAlertReportLive */
    SELECT id FROM moderation_reports WHERE id = ${reportId}::uuid LIMIT 1`)
  return rows.length > 0
}

/** Each role branch reads at most one page plus a continuation probe. */
export async function listCriticalAlertRecipientPage(
  afterUserId: string | null,
  pageSize: number,
  query: QueryExecutor = write,
  recipientUserIds?: readonly string[],
): Promise<{ recipientIds: string[]; nextAfterUserId: string | null }> {
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > getNotificationRecipientDispatchPageHardMax()
  )
    throw new RangeError('Invalid alert page size')
  const statement = sql`/* listCriticalAlertRecipientPage */
    WITH administrators AS MATERIALIZED (
      SELECT ur.user_id FROM user_roles ur
      WHERE ur.role_type_id = (SELECT id FROM user_role_types WHERE slug = 'administrator')
        AND ur.user_id > COALESCE(${afterUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`
  if (recipientUserIds) statement.append(sql` AND ur.user_id = ANY(${recipientUserIds}::uuid[])`)
  statement.append(sql`
      ORDER BY ur.user_id LIMIT ${pageSize + 1}
    ), moderators AS MATERIALIZED (
      SELECT ur.user_id FROM user_roles ur
      WHERE ur.role_type_id = (SELECT id FROM user_role_types WHERE slug = 'moderator')
        AND ur.user_id > COALESCE(${afterUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`)
  if (recipientUserIds) statement.append(sql` AND ur.user_id = ANY(${recipientUserIds}::uuid[])`)
  statement.append(sql`
      ORDER BY ur.user_id LIMIT ${pageSize + 1}
    )
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM administrators UNION ALL SELECT user_id FROM moderators
    ) staff
    ORDER BY user_id LIMIT ${pageSize + 1}`)
  const { rows } = await query<{ user_id: string }>(statement)
  const recipientIds = rows.slice(0, pageSize).map(row => row.user_id)
  return {
    recipientIds,
    nextAfterUserId: rows.length > pageSize ? (recipientIds.at(-1) ?? null) : null,
  }
}

/** The FK check provides its own key-share lock on written notification recipients. */
async function insertCriticalAlertNotifications(
  reportId: string,
  recipientIds: readonly string[],
): Promise<Array<{ user_id: string; id: string }>> {
  if (recipientIds.length === 0) return []
  // Each user-FK race commits a deletion of one fixed candidate. Recheck this same bounded page.
  for (let attempt = 0; attempt <= recipientIds.length; attempt += 1) {
    try {
      // no-mistakes-disable-next-line query-reached-per-item: bounded retries serialize only real user-FK deletion races.
      return await writeCriticalAlertCandidatePage(reportId, recipientIds) // eslint-disable-line no-await-in-loop -- each retry needs the previous FK race to finish first.
    } catch (err) {
      const pgError =
        typeof err === 'object' && err !== null
          ? (err as { code?: string; constraint?: string })
          : null
      if (
        pgError?.code !== '23503' ||
        pgError?.constraint !== 'notifications_user_id_fkey' ||
        attempt === recipientIds.length
      )
        throw err
    }
  }
  throw new Error('Critical alert recipient retry exhausted')
}

/** One fixed-candidate insert; EXPLAIN callers can supply a rollback transaction. */
export async function writeCriticalAlertCandidatePage(
  reportId: string,
  recipientIds: readonly string[],
  query: QueryExecutor = write,
): Promise<Array<{ user_id: string; id: string }>> {
  if (recipientIds.length > getNotificationRecipientDispatchPageHardMax())
    throw new RangeError('Too many alert recipients in one page')
  if (recipientIds.length === 0) return []
  const { rows } = await query<{ user_id: string; id: string }>(sql`
        /* insertCriticalAlertNotifications */
        INSERT INTO notifications (user_id, entity_type, moderation_report_id, delivery_type, title, body, target_path)
        SELECT candidates.user_id, 'critical_moderation_alert', ${reportId}::uuid,
          'subscription', 'Critical moderation alert',
          'A report requiring urgent review has been filed.', '/reports'
        FROM unnest(${recipientIds}::uuid[]) AS candidates(user_id)
        JOIN LATERAL (
          SELECT 1 FROM users u
          WHERE u.id = candidates.user_id AND u.deleted_at IS NULL
          LIMIT 1
        ) live_user ON true
        JOIN LATERAL (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = candidates.user_id
            AND ur.role_type_id = (SELECT id FROM user_role_types WHERE slug = 'administrator')
          UNION ALL
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = candidates.user_id
            AND ur.role_type_id = (SELECT id FROM user_role_types WHERE slug = 'moderator')
          LIMIT 1
        ) staff ON true
        ORDER BY candidates.user_id
        ON CONFLICT (user_id, moderation_report_id)
          WHERE entity_type = 'critical_moderation_alert'::notification_entity_types
            AND moderation_report_id IS NOT NULL AND deleted_at IS NULL
            AND delivery_type = 'subscription'::notification_delivery_types DO NOTHING
        RETURNING user_id, id`)
  return rows
}
