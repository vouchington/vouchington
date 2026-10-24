import { query as executeQuery, read, type QueryOptions } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import assert from 'http-assert'
import { APPEAL_SLA_HOURS, type ModerationAppealStatus } from './config.mts'
import type { ModerationAppealResponse } from './types.mts'
import { APPEAL_JOINS, APPEAL_SELECT } from './get-query.mts'

function addIsOverdue(appeal: ModerationAppealResponse): ModerationAppealResponse {
  if (appeal.status !== 'pending') return appeal
  const ageHours = (Date.now() - appeal.created_at.getTime()) / 3_600_000
  return { ...appeal, is_overdue: ageHours > APPEAL_SLA_HOURS }
}

export async function getModerationAppealById(
  id: string,
): Promise<ModerationAppealResponse | null> {
  return queryModerationAppealById(id, undefined, true)
}

/** Reads from the primary, or through `options.query` to see the caller's own uncommitted rows. */
export async function getModerationAppealByIdFromPrimary(
  id: string,
  options?: QueryOptions,
): Promise<ModerationAppealResponse | null> {
  return queryModerationAppealById(id, options, false)
}

async function queryModerationAppealById(
  id: string,
  options: QueryOptions | undefined,
  defaultReadOnly: boolean,
): Promise<ModerationAppealResponse | null> {
  const statement = sql``
    .append(APPEAL_SELECT)
    .append(sql`
    FROM moderation_appeals ma
    `)
    .append(APPEAL_JOINS).append(sql`
    WHERE ma.id = ${id}
    LIMIT 1
  `)
  const { rows } = await executeQuery<ModerationAppealResponse>(
    `/* getModerationAppealById */\n    SELECT ${statement.text}`,
    statement.values,
    { ...options, readOnly: defaultReadOnly },
  )
  const row = rows[0]
  return row ? addIsOverdue(row) : null
}

export async function getModerationAppealAfterMutation(
  id: string,
  options?: QueryOptions,
): Promise<ModerationAppealResponse> {
  const appeal = await getModerationAppealByIdFromPrimary(id, options)
  assert(appeal, 500, 'Appeal disappeared after mutation')
  return appeal
}

export type ListModerationAppealsOptions = {
  status?: ModerationAppealStatus
  limit?: number
  beforeId?: string | null
  appellantUserId?: string | null
}

export async function listModerationAppeals(
  options: ListModerationAppealsOptions = {},
): Promise<{ appeals: ModerationAppealResponse[]; hasNextPage: boolean }> {
  const { status = 'pending', limit = 25, beforeId, appellantUserId } = options
  const fetchLimit = limit + 1

  const query = sql`/* listModerationAppeals */
    SELECT `
    .append(APPEAL_SELECT)
    .append(sql`
    FROM moderation_appeals ma
    `)
    .append(APPEAL_JOINS).append(sql`
    WHERE `)
  query.append(moderationAppealStatusPredicate(status))
  query.append(sql`
  `)
  if (appellantUserId) {
    query.append(sql` AND ma.appellant_user_id = ${appellantUserId}`)
  }
  if (beforeId) {
    query.append(sql` AND ma.id < ${beforeId}`)
  }
  query.append(sql` ORDER BY ma.id DESC LIMIT ${fetchLimit}`)

  const { rows } = await read(query)
  const appeals = (rows as ModerationAppealResponse[]).map(addIsOverdue)
  const hasNextPage = appeals.length > limit
  return { appeals: appeals.slice(0, limit), hasNextPage }
}

function moderationAppealStatusPredicate(status: ModerationAppealStatus): SQLStatement {
  switch (status) {
    case 'pending':
      return sql`ma.resolved_at IS NULL`
    case 'dismissed':
      return sql`ma.resolved_at IS NOT NULL AND ma.resolution_action = 'deny'`
    case 'resolved':
      return sql`ma.resolved_at IS NOT NULL AND ma.resolution_action != 'deny'`
    default:
      throw new Error(`Unknown moderation appeal status: ${String(status)}`)
  }
}
