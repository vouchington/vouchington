import sql, { type SQLStatement } from 'sql-template-strings'
import { childVisibilitySql } from '@services/user-referral-program-links'
import {
  buildCommunityListProxyMutedTopicsCTE,
  buildExcludedCTE,
  buildHostnameExclusionExists,
} from '../sql-builders/index.mts'
import type { ReferralLinksFeedType } from './types.mts'

/** Keep every inspected ID, including ineligible rows, in the bounded backward walk. */
export function buildReferralLinksFeedQuery(
  userId: string,
  feedType: ReferralLinksFeedType,
  inspectionLimit: number,
  cursorId?: string,
): SQLStatement {
  const excludedUsersCte = buildExcludedCTE(
    userId,
    {
      relationTable: 'relation__user__mute__user',
      idColumn: 'user_id',
      cteAlias: 'excluded_users',
    },
    ['relation__user__block__user'],
  )

  const excludedTopicsCte = sql`excluded_topics AS (
      SELECT object_id AS topic_id
      FROM relation__user__mute__topic
      WHERE subject_id = ${userId}
        AND deleted_at IS NULL
      UNION
      `
    .append(buildCommunityListProxyMutedTopicsCTE(userId))
    .append(sql`)`)

  const query = sql``
    .append(excludedUsersCte)
    .append(sql`,
    `)
    .append(excludedTopicsCte)
    .append(
      sql`
    SELECT
      urpl.id,
      eligible.id AS eligible_id,
      urpl.user_id,
      urpl.referral_program_topic_id AS referral_program_id,
      eligible.referral_program_name,
      eligible.referral_program_slug,
      eligible.url,
      urpl.label,
      eligible.username,
      eligible.account_type,
      eligible.display_name,
      eligible.profile_image_id
    FROM user_referral_program_links urpl
    LEFT JOIN LATERAL (
      SELECT urpl.id, t.name AS referral_program_name, t.slug AS referral_program_slug,
        u.url, vup.username, vup.account_type,
        vup.display_account->>'name' AS display_name, vup.profile_image_id
      FROM urls u
    JOIN url_hostnames candidate_hostname ON candidate_hostname.id = u.hostname_id
    JOIN topics t ON t.id = urpl.referral_program_topic_id
    JOIN referral_program_topics trp ON trp.topic_id = urpl.referral_program_topic_id
      AND trp.enabled_at IS NOT NULL
      AND trp.disabled_at IS NULL
    JOIN view_users_public vup ON vup.id = urpl.user_id
    WHERE u.id = urpl.url_id
      AND urpl.deleted_at IS NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.activated_at IS NOT NULL
      AND urpl.user_id <> ${userId}
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user followed_user
        WHERE followed_user.subject_id = ${userId}
          AND followed_user.object_id = urpl.user_id
          AND followed_user.deleted_at IS NULL
      )
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
      AND NOT `,
    )
    .append(
      buildHostnameExclusionExists(
        userId,
        sql`candidate_hostname.id`,
        sql`candidate_hostname.reversed_hostname`,
      ),
    )
    .append(sql` AND NOT candidate_hostname.is_blocked
      AND NOT EXISTS (SELECT 1 FROM excluded_users WHERE excluded_users.user_id = urpl.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded_topics WHERE excluded_topics.topic_id = urpl.referral_program_topic_id)
      AND `)
    .append(childVisibilitySql('urpl.parent_link_id', 'urpl.user_id'))
    .append(
      sql`
      AND urpl.id = (
        SELECT urpl2.id
        FROM user_referral_program_links urpl2
        WHERE urpl2.user_id = urpl.user_id
          AND urpl2.referral_program_topic_id = urpl.referral_program_topic_id
          AND urpl2.deleted_at IS NULL
          AND urpl2.deactivated_at IS NULL
          AND urpl2.activated_at IS NOT NULL
          AND `,
    )
    .append(childVisibilitySql('urpl2.parent_link_id', 'urpl2.user_id'))
    .append(
      sql`
        ORDER BY urpl2.activated_at DESC, urpl2.id DESC
        LIMIT 1
      )
  `,
    )

  if (feedType === 'mutual_follows') {
    query.append(sql`
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user reverse_follow
        WHERE reverse_follow.subject_id = urpl.user_id
          AND reverse_follow.object_id = ${userId}
          AND reverse_follow.deleted_at IS NULL
      )
    `)
  }

  query.append(sql` LIMIT 1
    ) eligible ON TRUE`)

  if (cursorId) {
    query.append(sql` WHERE urpl.id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY urpl.id DESC
    LIMIT ${inspectionLimit}
  `)

  return sql`WITH `.append(query)
}
