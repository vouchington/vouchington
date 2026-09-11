import { read } from '@data-stores/psql'
import { decodeScopedUuidCursorWithLegacySimple, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import type { UserWarning } from './config.mts'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

export async function getUserWarningById(id: string): Promise<UserWarning | null> {
  const { rows } = await read(
    sql`/* getUserWarningById */
    SELECT id, user_id, community_id, issued_by_id, reason, public_message,
           report_id, revoked_at, revoked_by_id, created_at
    FROM user_warnings
    WHERE id = ${id}
    LIMIT 1
  `,
  )
  return (rows[0] as UserWarning) ?? null
}

export interface MemberUserWarningListItem {
  id: string
  user_id: string
  community_id: string | null
  public_message: string | null
  revoked_at: Date | null
  created_at: Date
  community_slug: string | null
}

export interface UserWarningListItem extends UserWarning {
  community_slug: string | null
  issued_by_username: string | null
}

export interface UserWarningPage<T extends { id: string } = UserWarningListItem> {
  warnings: T[]
  hasNextPage: boolean
  startCursor: string | null
  endCursor: string | null
}

export async function listReceivedUserWarnings(
  userId: string,
  options: { limit?: number; after?: string | null } = {},
): Promise<UserWarningPage<MemberUserWarningListItem>> {
  const limit = Math.floor(Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT)))
  const scope = getReceivedUserWarningsCursorScope(userId)
  const cursor = options.after
    ? decodeScopedUuidCursorWithLegacySimple(options.after, scope, 'Invalid cursor format')
    : null

  const query = sql`/* listReceivedUserWarnings */
    SELECT
      w.id,
      w.user_id,
      w.community_id,
      w.public_message,
      w.revoked_at,
      w.created_at,
      c.slug AS community_slug
    FROM user_warnings w
    LEFT JOIN communities c ON c.id = w.community_id
    WHERE w.user_id = ${userId}::uuid
  `

  if (cursor) {
    query.append(sql` AND w.id < ${cursor.id}::uuid`)
  }

  query.append(sql` ORDER BY w.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const items = rows as MemberUserWarningListItem[]
  const hasNextPage = items.length > limit
  const warnings = hasNextPage ? items.slice(0, limit) : items

  return {
    warnings,
    hasNextPage,
    startCursor: warnings.length > 0 ? encodeWarningCursor(warnings[0]!, scope) : null,
    endCursor:
      hasNextPage && warnings.length > 0 ? encodeWarningCursor(warnings.at(-1)!, scope) : null,
  }
}

export async function listIssuedUserWarnings(
  options: { userId?: string; communityId?: string; limit?: number; after?: string | null } = {},
): Promise<UserWarningPage> {
  const limit = Math.floor(Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT)))
  const scope = getIssuedUserWarningsCursorScope(options)
  const cursor = options.after
    ? decodeScopedUuidCursorWithLegacySimple(options.after, scope, 'Invalid cursor format')
    : null

  const query = sql`/* listIssuedUserWarnings */
    SELECT
      w.id,
      w.user_id,
      w.community_id,
      w.issued_by_id,
      w.reason,
      w.public_message,
      w.report_id,
      w.revoked_at,
      w.revoked_by_id,
      w.created_at,
      c.slug AS community_slug,
      u.username AS issued_by_username
    FROM user_warnings w
    LEFT JOIN communities c ON c.id = w.community_id
    LEFT JOIN users u ON u.id = w.issued_by_id
    WHERE true
  `

  if (options.userId) {
    query.append(sql` AND w.user_id = ${options.userId}::uuid`)
  }
  if (options.communityId) {
    query.append(sql` AND w.community_id = ${options.communityId}::uuid`)
  }
  if (cursor) {
    query.append(sql` AND w.id < ${cursor.id}::uuid`)
  }

  query.append(sql` ORDER BY w.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const items = rows as UserWarningListItem[]
  const hasNextPage = items.length > limit
  const warnings = hasNextPage ? items.slice(0, limit) : items

  return {
    warnings,
    hasNextPage,
    startCursor: warnings.length > 0 ? encodeWarningCursor(warnings[0]!, scope) : null,
    endCursor:
      hasNextPage && warnings.length > 0 ? encodeWarningCursor(warnings.at(-1)!, scope) : null,
  }
}

function encodeWarningCursor(warning: { id: string }, scope: string): string {
  return encodeScopedUuidCursor(warning.id, scope)
}

function getReceivedUserWarningsCursorScope(userId: string): string {
  return `user-warnings:received:user:${userId}:id-desc`
}

function getIssuedUserWarningsCursorScope(options: {
  userId?: string | null
  communityId?: string | null
}): string {
  return [
    'user-warnings:issued:id-desc',
    `user:${options.userId ?? '*'}`,
    `community:${options.communityId ?? '*'}`,
  ].join(':')
}
