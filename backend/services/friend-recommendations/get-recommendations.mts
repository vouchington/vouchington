import { clampLimit } from '@services/pagination'
import { read } from '@data-stores/psql'

import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'

export type FriendRecommendationResult = {
  __entity_type: 'user'
  id: string
  provider: 'facebook' | 'x' | 'github'
  provider_friend_name: string
}

type FriendRecommendationsResponse = {
  results: FriendRecommendationResult[]
  page_info: PageInfo
}

type FriendRecommendationsOptions = {
  limit?: number
  after?: string
}

export async function getFriendRecommendations(
  currentUser: PrivateUser,
  options: FriendRecommendationsOptions = {},
): Promise<FriendRecommendationsResponse> {
  const limit = clampLimit(options.limit)
  const cursorScope = JSON.stringify({
    resource: 'my-friend-recommendations',
    owner_id: currentUser.id,
    order: 'id-asc',
  })

  let cursorId: string | undefined
  if (options.after) {
    const cursor = decodeScopedUuidCursor(
      options.after,
      cursorScope,
      'Invalid friend recommendations cursor',
    )
    cursorId = cursor.id
  }

  const cursorFilter = cursorId ? 'AND deduped.id > $3' : ''
  const limitParameter = cursorId ? '$4' : '$3'
  const observedAfter = new Date(Date.now() - 90 * 86_400_000)
  const values = cursorId
    ? [currentUser.id, observedAfter, cursorId, limit + 1]
    : [currentUser.id, observedAfter, limit + 1]

  const { rows } = await read(
    `/* getFriendRecommendations */
WITH friends AS (
      -- Facebook friends
      SELECT
        u.id,
        'facebook'::TEXT AS provider,
        COALESCE(fa.facebook_user_data->>'name', '') AS provider_friend_name
      FROM facebook_friends ff
      JOIN facebook_accounts my_fa ON my_fa.id = ff.facebook_account_id
      JOIN facebook_accounts fa ON fa.id = ff.friend_facebook_account_id
      JOIN users u ON u.id = fa.user_id
      WHERE my_fa.user_id = $1
        AND ff.last_observed_at >= $2
        AND u.deleted_at IS NULL
        AND u.processing_restricted_at IS NULL
        AND u.id != $1

      UNION ALL

      -- X friends
      SELECT
        u.id,
        'x'::TEXT AS provider,
        COALESCE(xa.x_user_data->>'name', xa.x_user_data->>'username', '') AS provider_friend_name
      FROM x_friends xf
      JOIN x_accounts my_xa ON my_xa.id = xf.x_account_id
      JOIN x_accounts xa ON xa.id = xf.friend_x_account_id
      JOIN users u ON u.id = xa.user_id
      WHERE my_xa.user_id = $1
        AND xf.last_observed_at >= $2
        AND u.deleted_at IS NULL
        AND u.processing_restricted_at IS NULL
        AND u.id != $1

      UNION ALL

      -- GitHub friends
      SELECT
        u.id,
        'github'::TEXT AS provider,
        COALESCE(ga.github_user_data->>'name', ga.github_user_data->>'login', '') AS provider_friend_name
      FROM github_friends gf
      JOIN github_accounts my_ga ON my_ga.id = gf.github_account_id
      JOIN github_accounts ga ON ga.id = gf.friend_github_account_id
      JOIN users u ON u.id = ga.user_id
      WHERE my_ga.user_id = $1
        AND gf.last_observed_at >= $2
        AND u.deleted_at IS NULL
        AND u.processing_restricted_at IS NULL
        AND u.id != $1
    ),
    excluded AS (
      SELECT object_id FROM relation__user__follow__user
      WHERE subject_id = $1 AND deleted_at IS NULL
      UNION
      SELECT object_id FROM relation__user__mute__user
      WHERE subject_id = $1 AND deleted_at IS NULL
      UNION
      SELECT object_id FROM relation__user__block__user
      WHERE subject_id = $1 AND deleted_at IS NULL
      UNION
      SELECT subject_id FROM relation__user__block__user
      WHERE object_id = $1 AND deleted_at IS NULL
      UNION
      SELECT object_id FROM relation__user__dismiss_recommendation__user
      WHERE subject_id = $1 AND deleted_at IS NULL
    ),
    deduped AS (
      SELECT DISTINCT ON (id) id, provider, provider_friend_name
      FROM friends
      ORDER BY id, provider
    )
    SELECT deduped.id, deduped.provider, deduped.provider_friend_name
    FROM deduped
    LEFT JOIN excluded ON deduped.id = excluded.object_id
    WHERE excluded.object_id IS NULL
      ${cursorFilter}
    ORDER BY deduped.id
    LIMIT ${limitParameter}`,
    values,
  )

  const hasNextPage = rows.length > limit
  const resultRows = rows.slice(0, limit)

  const results: FriendRecommendationResult[] = resultRows.map(row => ({
    __entity_type: 'user' as const,
    id: row.id as string,
    provider: row.provider as 'facebook' | 'x' | 'github',
    provider_friend_name: row.provider_friend_name as string,
  }))

  const lastResult = resultRows.at(-1)
  const firstResult = resultRows.at(0)

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && lastResult
          ? encodeScopedUuidCursor(lastResult.id as string, cursorScope)
          : null,
      start_cursor: firstResult
        ? encodeScopedUuidCursor(firstResult.id as string, cursorScope)
        : null,
    },
  }
}
