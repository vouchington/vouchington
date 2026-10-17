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
  const upperPrefix = nextTextPatternPrefix(lowerQuery)
  const values: Array<string | number> = [lowerQuery, `${escapeLikePattern(lowerQuery)}%`]
  const upperInput =
    upperPrefix !== undefined ? `, $${values.push(upperPrefix)}::text AS upper_prefix` : ''
  const upperFilter =
    upperPrefix !== undefined ? ' AND LOWER(users.username) ~<~ search_input.upper_prefix' : ''
  const afterFilter =
    options.after !== undefined ? ` AND LOWER(users.username) > search_input.after` : ''
  const afterInput =
    options.after !== undefined ? `, $${values.push(options.after)}::text AS after` : ''
  const pageLimitParameter = `$${values.push(limit + 1)}`

  const { rows } = await read(
    `/* searchUsers */
    WITH search_input AS MATERIALIZED (
      SELECT $1::text AS prefix, $2::text AS pattern${upperInput}${afterInput}
    ), username_candidates AS MATERIALIZED (
      SELECT users.id, LOWER(users.username) AS username_sort
      FROM search_input
      JOIN users ON users.deleted_at IS NULL
        AND users.username IS NOT NULL
        AND LOWER(users.username) ~>=~ search_input.prefix${upperFilter}
        AND LOWER(users.username) LIKE search_input.pattern ESCAPE '\\'${afterFilter}
    ), matched_users AS MATERIALIZED (
      SELECT username_candidates.id, username_candidates.username_sort
      FROM username_candidates
      ORDER BY username_candidates.username_sort
      LIMIT ${pageLimitParameter}
    )
    SELECT vup.*
    FROM matched_users
    JOIN LATERAL (
      WITH keyed_user AS MATERIALIZED (
        SELECT * FROM view_users_public WHERE id = matched_users.id
      )
      SELECT * FROM keyed_user
    ) vup ON TRUE
    ORDER BY matched_users.username_sort`,
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
    JOIN LATERAL (
      SELECT * FROM view_users_private WHERE id = matched_users.id LIMIT 1
    ) vup ON true
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

/** Upper exclusive bound in the bytewise ordering used by text_pattern_ops. */
function nextTextPatternPrefix(prefix: string): string | undefined {
  const codePoints = Array.from(prefix, character => character.codePointAt(0)!)
  for (let index = codePoints.length - 1; index >= 0; index--) {
    const codePoint = codePoints[index]!
    if (codePoint === 0x10ffff) continue
    const next = codePoint === 0xd7ff ? 0xe000 : codePoint + 1
    return String.fromCodePoint(...codePoints.slice(0, index), next)
  }
  return undefined
}
