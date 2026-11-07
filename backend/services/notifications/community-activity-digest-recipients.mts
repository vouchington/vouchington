import { getNotificationsWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function listCommunityActivityDigestRecipientPage(
  afterUserId?: string,
  throughUserId?: string,
  userIds?: readonly string[],
  batchSize = getNotificationsWorkLimit('community_digest_recipient_batch_size'),
) {
  const query = sql`/* listCommunityActivityDigestRecipients */
    WITH user_page AS MATERIALIZED (
      SELECT cm.user_id
      FROM community_members cm
      WHERE cm.removed_at IS NULL
        AND cm.role IN ('owner', 'moderator')
  `
  if (userIds) query.append(sql` AND cm.user_id = ANY(${userIds}::uuid[])`)
  if (afterUserId) query.append(sql` AND cm.user_id > ${afterUserId}`)
  if (throughUserId) query.append(sql` AND cm.user_id <= ${throughUserId}`)
  query.append(sql`
      ORDER BY cm.user_id
      LIMIT ${batchSize + 1}
    )
    SELECT page.user_id, (
      live_user.id IS NOT NULL AND live_membership.user_id IS NOT NULL
    ) AS kept
    FROM user_page page
    LEFT JOIN LATERAL (
      SELECT u.id
      FROM users u
      WHERE u.id = page.user_id
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_suspensions us
          WHERE us.user_id = u.id AND us.lifted_at IS NULL
        )
      LIMIT 1
    ) live_user ON TRUE
    LEFT JOIN LATERAL (
      SELECT cm.user_id
      FROM community_members cm
      JOIN LATERAL (
        SELECT c.id
        FROM communities c
        WHERE c.id = cm.community_id
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
        LIMIT 1
      ) live_community ON TRUE
      WHERE cm.user_id = page.user_id
        AND cm.removed_at IS NULL
        AND cm.role IN ('owner', 'moderator')
      LIMIT 1
    ) live_membership ON TRUE
    ORDER BY page.user_id
  `)
  const { rows } = await read<{ user_id: string; kept: boolean }>(query)
  const hasMore = rows.length > batchSize
  const inspected = rows.slice(0, batchSize)
  const seen = new Set<string>()
  return {
    page: inspected.flatMap(row => {
      if (!row.kept || seen.has(row.user_id)) return []
      seen.add(row.user_id)
      return [{ user_id: row.user_id }]
    }),
    hasMore,
    nextUserId: hasMore ? (inspected.at(-1)?.user_id ?? null) : null,
  }
}
