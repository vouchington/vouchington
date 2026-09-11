import { read } from '@data-stores/psql'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import { isUUID } from '@modules/utils'
import type { PrivateUser, PublicUser } from './types.mts'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25

export async function searchUsers(
  q: string,
  options: { limit?: number; after?: string } = {},
): Promise<{ results: PublicUser[]; hasNextPage: boolean }> {
  const query = q.trim()
  if (!query) return { results: [], hasNextPage: false }

  const limit = Math.max(0, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
  const lowerQuery = query.toLowerCase()
  const escapedQuery = escapeLikePattern(lowerQuery)

  const values: Array<string | number> = [`${escapedQuery}%`]
  const afterFilter =
    options.after !== undefined ? ` AND LOWER(username) > $${values.push(options.after)}` : ''

  const { rows } = await read(
    `/* searchUsers */
    SELECT * FROM view_users_public
    WHERE LOWER(username) LIKE $1 ESCAPE '\\'${afterFilter}
    ORDER BY LOWER(username)
    LIMIT $${values.push(limit + 1)}`,
    values,
  )

  const hasNextPage = rows.length > limit
  return { results: rows.slice(0, limit) as PublicUser[], hasNextPage }
}

export async function searchAdminUsers(
  q: string,
  options: { limit?: number; after?: string } = {},
): Promise<{ results: PrivateUser[]; hasNextPage: boolean }> {
  const query = q.trim()
  if (!query) return { results: [], hasNextPage: false }

  const limit = Math.max(0, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
  const lowerQuery = query.toLowerCase()
  const escapedQuery = escapeLikePattern(lowerQuery)
  const filters = [`LOWER(users.username) LIKE $1 ESCAPE '\\'`]
  const values: Array<string | number> = [`${escapedQuery}%`]

  if (isUUID(query)) {
    filters.push(`users.id = $${values.push(query)}`)
  }

  if (isEmailAddress(query)) {
    filters.push(`EXISTS (
      SELECT 1
      FROM user_email_addresses
      WHERE user_email_addresses.email_address = $${values.push(lowerQuery)}
        AND user_email_addresses.user_id = users.id
        AND user_email_addresses.is_primary = TRUE
    )`)
  }

  const matchFilter = filters.map(filter => `(${filter})`).join(' OR ')
  const afterFilter =
    options.after !== undefined
      ? ` AND COALESCE(LOWER(users.username), '') > $${values.push(options.after)}`
      : ''

  const { rows } = await read(
    `/* searchAdminUsers */
    WITH matched_users AS MATERIALIZED (
      SELECT
        users.id,
        COALESCE(LOWER(users.username), '') AS username_sort
      FROM users
      WHERE users.deleted_at IS NULL
        AND (${matchFilter})${afterFilter}
      -- No secondary tiebreaker needed: username_sort ties only at '' (no username), and the id/
      -- email branches are each globally unique and mutually exclusive per query, so at most one
      -- username-less row can ever appear in a single result set.
      ORDER BY username_sort
      LIMIT $${values.push(limit + 1)}
    )
    SELECT vup.*
    FROM matched_users
    JOIN view_users_private vup ON vup.id = matched_users.id
    ORDER BY matched_users.username_sort`,
    values,
  )

  const hasNextPage = rows.length > limit
  return { results: rows.slice(0, limit) as PrivateUser[], hasNextPage }
}

/**
 * Cursor scope for `GET /api/v1/users?q=`. Admin and public callers see different result sets for
 * the same query (UUID/email exact-match branches are admin-only), so scope must bind the view.
 */
export function usersSearchCursorScope(filters: { query: string; admin: boolean }): string {
  return JSON.stringify({
    query: filters.query.trim().toLowerCase(),
    admin: filters.admin,
    order: 'username-asc',
  })
}

function escapeLikePattern(pattern: string): string {
  return pattern.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
