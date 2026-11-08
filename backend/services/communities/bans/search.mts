import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  decodeScopedUuidCursor,
  decodeUuidCursor,
  encodeCursor,
  encodeScopedUuidCursor,
  hasExactKeys,
  isSimpleCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityBan } from '../types.mts'

export type CommunityBanSummary = Omit<CommunityBan, 'reason' | 'case_id'>

export async function listActiveCommunityBans(
  communityId: string,
  userId: string,
  options?: QueryOptions & { limit?: number; after?: string },
): Promise<{ results: CommunityBanSummary[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')
  const cursorScope = `community-active-bans:${communityId}:${userId}`
  let cursorExpiry: string | undefined
  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isActiveBanExpiryCursor, 'Invalid cursor format')
    assert(cursor.scope === cursorScope, 422, 'Invalid cursor scope')
    cursorExpiry = cursor.timestamp
    assert(isCursorExpiry(cursorExpiry), 422, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* listActiveCommunityBans */
    SELECT id, community_id, user_id, banned_by_id, expires_at,
      created_at, updated_at, lifted_at, lifted_by_id, expires_at::text AS cursor_expires_at
    FROM community_bans
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND lifted_at IS NULL
      AND COALESCE(expires_at, 'infinity'::timestamptz) > CURRENT_TIMESTAMP
  `
  if (cursorExpiry !== undefined && cursorId !== undefined) {
    query.append(sql` AND (COALESCE(expires_at, 'infinity'::timestamptz), id)
      > (${cursorExpiry}::timestamptz, ${cursorId}::uuid)`)
  }
  query.append(sql` ORDER BY COALESCE(expires_at, 'infinity'::timestamptz), id
    LIMIT ${limit + 1}`)
  const { rows } = await read<CommunityBanSummary & { cursor_expires_at: string | null }>(
    query,
    options,
  )
  const selected = rows.slice(0, limit)
  const results = selected.map(({ cursor_expires_at: _, ...ban }) => ban)
  const hasNextPage = rows.length > limit
  const cursorFor = (ban: (typeof selected)[number]) =>
    encodeCursor({ timestamp: ban.cursor_expires_at ?? 'infinity', scope: cursorScope, id: ban.id })
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: selected.length ? cursorFor(selected[0]!) : null,
      end_cursor: hasNextPage && selected.length ? cursorFor(selected.at(-1)!) : null,
    },
  }
}

type ActiveBanExpiryCursor = { timestamp: string; scope: string; id: string }

function isActiveBanExpiryCursor(value: unknown): value is ActiveBanExpiryCursor {
  return (
    hasExactKeys(value, ['timestamp', 'scope', 'id']) &&
    typeof value.timestamp === 'string' &&
    typeof value.scope === 'string' &&
    typeof value.id === 'string'
  )
}

function isCursorExpiry(value: string): boolean {
  if (value === 'infinity') return true
  if (
    !/^[0-9]{4,6}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]) ([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?[+-](0[0-9]|1[0-5])(:[0-5][0-9])?$/.test(
      value,
    )
  )
    return false
  const [year, month, day] = value.split(' ')[0]!.split('-').map(Number) as [number, number, number]
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return year > 0 && !Number.isNaN(Date.parse(value)) && day <= monthDays[month - 1]!
}

export type UserCommunityBanItem = CommunityBan & { community_slug: string | null }

export async function listUserActiveCommunityBans(
  userId: string,
  options?: QueryOptions & { limit?: number; after?: string },
): Promise<{ results: UserCommunityBanItem[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 25
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined
  const cursorScope = `user-community-bans:${userId}:active:id-desc`
  if (options?.after) {
    const cursor = decodeScopedUuidCursor(options.after, cursorScope, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* listUserActiveCommunityBans */
    SELECT cb.id, cb.community_id, cb.user_id, cb.banned_by_id, cb.reason, cb.expires_at,
      cb.created_at, cb.updated_at, cb.lifted_at, cb.lifted_by_id, cb.case_id,
      c.slug AS community_slug
    FROM community_bans cb
    LEFT JOIN communities c ON c.id = cb.community_id
    WHERE cb.user_id = ${userId}
      AND cb.lifted_at IS NULL
      AND (cb.expires_at IS NULL OR cb.expires_at > CURRENT_TIMESTAMP)
  `

  if (cursorId !== undefined) {
    // DESC order: next page has smaller IDs than the cursor
    query.append(sql` AND cb.id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY cb.id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as UserCommunityBanItem[]

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeScopedUuidCursor(results.at(-1)!.id, cursorScope)
          : null,
      start_cursor: results.length > 0 ? encodeScopedUuidCursor(results[0]!.id, cursorScope) : null,
    },
  }
}

export async function searchCommunityBans(
  communityId: string,
  options?: QueryOptions & { limit?: number; after?: string },
): Promise<{ results: CommunityBanSummary[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* searchCommunityBans */
    SELECT id, community_id, user_id, banned_by_id, expires_at,
      created_at, updated_at, lifted_at, lifted_by_id
    FROM community_bans
    WHERE community_id = ${communityId}
  `

  if (cursorId !== undefined) {
    query.append(sql` AND id > ${cursorId}`)
  }

  query.append(sql`
    ORDER BY id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityBanSummary[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityBanSummary)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0 ? encodeCursor({ id: results.at(-1)!.id }) : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0]!.id }) : null,
    },
  }
}
