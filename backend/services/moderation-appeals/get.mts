import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { APPEAL_SLA_HOURS, type ModerationAppealStatus } from './config.mts'
import { getCaseTrace, type ModerationCaseTrace } from '@services/moderation-cases'
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
  return queryModerationAppealById(id, read)
}

export async function getModerationAppealByIdFromPrimary(
  id: string,
): Promise<ModerationAppealResponse | null> {
  return queryModerationAppealById(id, write)
}

async function queryModerationAppealById(
  id: string,
  query: typeof read,
): Promise<ModerationAppealResponse | null> {
  const { rows } = await query<ModerationAppealResponse>(
    sql`/* getModerationAppealById */
    SELECT `
      .append(APPEAL_SELECT)
      .append(sql`
    FROM moderation_appeals ma
    `)
      .append(APPEAL_JOINS).append(sql`
    WHERE ma.id = ${id}
    LIMIT 1
  `),
  )
  const row = rows[0]
  return row ? addIsOverdue(row) : null
}

export async function getModerationAppealAfterMutation(
  id: string,
): Promise<ModerationAppealResponse> {
  const appeal = await getModerationAppealByIdFromPrimary(id)
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
  appendModerationAppealStatusPredicate(query, status)
  query.append(sql`
  `)
  if (appellantUserId) {
    query.append(sql` AND ma.appellant_id = ${appellantUserId}`)
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

/**
 * Retrieve the full moderation case trace for a given appeal, restoring the
 * appeal → originating report hop that was previously broken.
 */
export async function getAppealCaseTrace(appealId: string): Promise<ModerationCaseTrace | null> {
  const { rows } = await read<{ case_id: string }>(sql`/* getAppealCaseTrace */
    SELECT case_id FROM moderation_appeals WHERE id = ${appealId} LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  return getCaseTrace(row.case_id)
}

export type { ModerationCaseTrace }

function appendModerationAppealStatusPredicate(
  query: ReturnType<typeof sql>,
  status: ModerationAppealStatus,
): void {
  if (status === 'pending') {
    query.append(sql`ma.resolved_at IS NULL`)
  } else if (status === 'dismissed') {
    query.append(sql`ma.resolved_at IS NOT NULL AND ma.resolution_action = 'deny'`)
  } else {
    query.append(sql`ma.resolved_at IS NOT NULL AND ma.resolution_action != 'deny'`)
  }
}
