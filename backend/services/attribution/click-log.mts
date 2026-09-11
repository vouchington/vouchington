import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { ReferralClickLogEntry } from '@voucha/types/entities/referral-click-log'
import type { PublicUser } from '@voucha/types/entities/user'

export async function getReferralClickLog(
  referrerId: string,
  options?: { after?: string; limit?: number },
): Promise<{
  results: Array<{ __entity_type: 'referral_click_log'; id: string }>
  clicks: Record<string, ReferralClickLogEntry>
  users: Record<string, PublicUser>
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)
  let afterId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* getReferralClickLog */
    SELECT
      sra.id,
      sra.landing_url,
      sra.signed_up_at,
      sra.user_id,
      sra.created_at,
      users.id AS user__id,
      users.username AS user__username,
      users.profile_image_id AS user__profile_image_id,
      (
        SELECT COALESCE(ARRAY_AGG(user_roles_types.slug), ARRAY[]::TEXT[])
        FROM user_roles
        LEFT JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
        WHERE user_roles.user_id = users.id
      ) AS user__roles
    FROM session_referral_attributions sra
    LEFT JOIN users ON users.id = sra.user_id
      AND users.deleted_at IS NULL
    WHERE sra.referrer_id = ${referrerId}
  `

  if (afterId) {
    query.append(sql` AND sra.id < ${afterId}`)
  }

  query.append(sql`
    ORDER BY sra.id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query)
  const hasNextPage = rows.length > limit

  const results: Array<{ __entity_type: 'referral_click_log'; id: string }> = []
  const clicks: Record<string, ReferralClickLogEntry> = {}
  const users: Record<string, PublicUser> = {}

  for (const row of rows) {
    if (results.length >= limit) break
    const id = row.id as string
    results.push({ __entity_type: 'referral_click_log', id })
    clicks[id] = {
      __entity_type: 'referral_click_log',
      id,
      landing_url: row.landing_url as string,
      signed_up_at: (row.signed_up_at as Date | null) ?? null,
      user_id: (row.user_id as string | null) ?? null,
      created_at: row.created_at as Date,
    }
    if (row.user__id) {
      const userId = row.user__id as string
      users[userId] = {
        __entity_type: 'user',
        id: userId,
        username: (row.user__username as string | undefined) ?? undefined,
        roles: [],
        profile_image_id: (row.user__profile_image_id as string | null) ?? null,
      }
    }
  }

  return {
    results,
    clicks,
    users,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeCursor({ id: results[0].id }) : null,
      end_cursor: hasNextPage && results.at(-1) ? encodeCursor({ id: results.at(-1)!.id }) : null,
    },
  }
}
