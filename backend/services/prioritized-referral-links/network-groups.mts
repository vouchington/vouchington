import sql, { type SQLStatement } from 'sql-template-strings'
import { childVisibilitySql } from '@services/user-referral-program-links'

type NetworkGroupsInput = {
  viewerId: string
  referralProgramId: string
  officialUserId: string | null
  /** The personalized link limit; each group, and the total, is capped at this many people. */
  limit: number
}

const followEdgeSql = (viewerId: string, mutual: boolean): SQLStatement =>
  sql`SELECT f.object_id AS user_id
    FROM relation__user__follow__user f
    WHERE f.subject_id = ${viewerId} AND f.deleted_at IS NULL
      AND `.append(mutual ? 'EXISTS' : 'NOT EXISTS').append(sql` (
        SELECT 1 FROM relation__user__follow__user back
        WHERE back.subject_id = f.object_id AND back.object_id = ${viewerId}
          AND back.deleted_at IS NULL
      )`)

/**
 * One CTE per network group. Each applies every link filter (program, active, not self, not the
 * official account, not muted, not blocked, child visibility) before its own LIMIT, and keeps a
 * person's newest activated link, so a group is never used up by people with no usable link.
 * Together they are at most four times the limit; `active_links` keeps each person's best group.
 */
export function networkGroupsSql(input: NetworkGroupsInput): SQLStatement {
  const groups: Array<[string, number, SQLStatement]> = [
    ['mutual_follows', 1, followEdgeSql(input.viewerId, true)],
    ['follows', 2, followEdgeSql(input.viewerId, false)],
    [
      'referrers',
      3,
      sql`SELECT sra.referrer_user_id AS user_id
    FROM session_referral_attributions sra
    WHERE sra.user_id = ${input.viewerId} AND sra.referrer_user_id IS NOT NULL`,
    ],
    ['rated_authors', 4, sql`SELECT user_id FROM rated_positively`],
  ]
  const query = sql``
  for (const [name, priorityGroup, source] of groups) {
    query.append(`${name} AS (
  SELECT * FROM (
    SELECT DISTINCT ON (al.user_id)
      al.id, al.user_id, al.referral_program_topic_id, al.url_id, al.label, al.activated_at,
      ${priorityGroup} AS priority_group
    FROM (`)
    query.append(source).append(sql`) src
    JOIN user_referral_program_links al ON al.user_id = src.user_id
    WHERE al.referral_program_topic_id = ${input.referralProgramId}
      AND al.user_id <> ${input.viewerId}
      AND al.user_id IS DISTINCT FROM ${input.officialUserId}::uuid
      AND al.activated_at IS NOT NULL
      AND al.deleted_at IS NULL
      AND al.deactivated_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM relation__user__mute__user m
        WHERE m.subject_id = ${input.viewerId} AND m.object_id = al.user_id AND m.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM relation__user__block__user b
        WHERE b.subject_id = ${input.viewerId} AND b.object_id = al.user_id AND b.deleted_at IS NULL
      )
      AND `)
    query.append(childVisibilitySql('al.parent_link_id', 'al.user_id'))
    query.append(`
    ORDER BY al.user_id, al.activated_at DESC, al.id
  ) newest
  ORDER BY activated_at DESC, id
  LIMIT ${input.limit}
),
`)
  }
  // `url` is output only and `url_id` is NOT NULL with a foreign key, so the urls join cannot
  // filter; it runs once per kept person here instead of once per matching link per group.
  return query.append(`active_links AS (
  SELECT best.id, best.user_id, best.referral_program_topic_id, u.url, best.label,
    best.activated_at, best.priority_group
  FROM (
    SELECT DISTINCT ON (user_id) id, user_id, referral_program_topic_id, url_id, label,
      activated_at, priority_group
    FROM (
      SELECT * FROM mutual_follows UNION ALL SELECT * FROM follows
      UNION ALL SELECT * FROM referrers UNION ALL SELECT * FROM rated_authors
    ) grouped
    ORDER BY user_id, priority_group
  ) best
  JOIN urls u ON u.id = best.url_id
)`)
}
