import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { childVisibilitySql } from '@services/user-referral-program-links'
import {
  buildCommunityListProxyMutedTopicsCTE,
  buildExcludedCTE,
  buildExcludedHostnameIdsCTE,
  buildFollowedCTE,
} from '../sql-builders/index.mts'
import type {
  ReferralLinkFeedRow,
  ReferralLinkFeedUserRow,
  ReferralLinksFeedType,
} from './types.mts'

export async function getReferralLinksFeed(
  currentUser: PrivateUser,
  feedType: ReferralLinksFeedType,
  options?: { limit?: number; after?: string },
): Promise<{
  results: ReferralLinkFeedRow[]
  users: Record<string, ReferralLinkFeedUserRow>
  page_info: PageInfo
}> {
  const limit = options?.limit ?? 25

  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const followedCte = buildFollowedCTE(currentUser.id, {
    relationTable: 'relation__user__follow__user',
    idColumn: 'user_id',
    cteAlias: 'followed_users',
  })

  const excludedUsersCte = buildExcludedCTE(
    currentUser.id,
    {
      relationTable: 'relation__user__mute__user',
      idColumn: 'user_id',
      cteAlias: 'excluded_users',
    },
    ['relation__user__block__user'],
  )

  const excludedHostnamesCte = buildExcludedHostnameIdsCTE(currentUser.id)

  const excludedTopicsCte = sql`excluded_topics AS (
      SELECT object_id AS topic_id
      FROM relation__user__mute__topic
      WHERE subject_id = ${currentUser.id}
        AND deleted_at IS NULL
      UNION
      `
    .append(buildCommunityListProxyMutedTopicsCTE(currentUser.id))
    .append(sql`)`)

  const query = sql`/* getReferralLinksFeed */
    WITH `
    .append(followedCte)
    .append(sql`,
    `)
    .append(excludedUsersCte)
    .append(sql`,
    `)
    .append(excludedHostnamesCte)
    .append(sql`,
    `)
    .append(excludedTopicsCte)
    .append(
      sql`
    SELECT
      urpl.id,
      urpl.user_id,
      urpl.referral_program_id,
      t.name AS referral_program_name,
      t.slug AS referral_program_slug,
      u.url,
      urpl.label,
      vup.username,
      vup.display_account->>'name' AS display_name,
      vup.profile_image_id
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN topics t ON t.id = urpl.referral_program_id
    JOIN topics__referral_programs trp ON trp.topic_id = urpl.referral_program_id
      AND trp.enabled_at IS NOT NULL
      AND trp.disabled_at IS NULL
    JOIN view_users_public vup ON vup.id = urpl.user_id
    JOIN followed_users fu ON fu.user_id = urpl.user_id
    WHERE urpl.deleted_at IS NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.activated_at IS NOT NULL
      AND urpl.user_id <> ${currentUser.id}
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
      AND u.hostname_id NOT IN (SELECT hostname_id FROM excluded_hostname_ids)
      AND NOT EXISTS (SELECT 1 FROM excluded_users WHERE excluded_users.user_id = urpl.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded_topics WHERE excluded_topics.topic_id = urpl.referral_program_id)
      AND `,
    )
    .append(childVisibilitySql('urpl.parent_link_id', 'urpl.user_id'))
    .append(
      sql`
      AND urpl.id = (
        SELECT urpl2.id
        FROM user_referral_program_links urpl2
        WHERE urpl2.user_id = urpl.user_id
          AND urpl2.referral_program_id = urpl.referral_program_id
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
          AND reverse_follow.object_id = ${currentUser.id}
          AND reverse_follow.deleted_at IS NULL
      )
    `)
  }

  if (cursorId) {
    query.append(sql` AND urpl.id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY urpl.id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  const slicedRows = rows.slice(0, limit)

  const results: ReferralLinkFeedRow[] = slicedRows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    referral_program_id: row.referral_program_id,
    referral_program_name: row.referral_program_name,
    referral_program_slug: row.referral_program_slug,
    url: row.url,
    label: row.label,
  }))

  const users: Record<string, ReferralLinkFeedUserRow> = {}
  for (const row of slicedRows) {
    if (!users[row.user_id]) {
      users[row.user_id] = {
        id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        profile_image_id: row.profile_image_id,
      }
    }
  }

  return {
    results,
    users,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0 ? encodeCursor({ id: results.at(-1)!.id }) : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0]!.id }) : null,
    },
  }
}
