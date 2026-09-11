import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildCommunityListProxyFollowedTopicsCTE,
  buildCommunityListProxyMutedTopicsCTE,
  buildCommunityListTopicsCTE,
  buildExcludedCTE,
  buildExcludedHostnameIdsCTE,
  buildFollowedCTE,
  buildHiddenCTE,
} from '../../sql-builders/index.mts'

export function appendPostFeedRelationCTEs(
  query: SQLStatement,
  { communityId, currentUserId }: { communityId?: string; currentUserId: string },
): SQLStatement {
  return query
    .append(
      buildFollowedCTE(currentUserId, {
        relationTable: 'relation__user__follow__user',
        idColumn: 'user_id',
        cteAlias: 'followed_users',
      }),
    )
    .append(sql`,
    `)
    .append(buildFollowedTopicsCTE({ communityId, currentUserId }))
    .append(sql`,
    `)
    .append(buildExcludedTopicsCTE(currentUserId))
    .append(sql`,
    `)
    .append(buildExcludedUsersCTE(currentUserId))
    .append(sql`,
    `)
    .append(
      buildHiddenCTE(currentUserId, {
        relationTable: 'relation__user__hide__post',
        idColumn: 'post_id',
        cteAlias: 'hidden_posts',
      }),
    )
    .append(sql`,
    `)
    .append(buildExcludedHostnameIdsCTE(currentUserId))
}

function buildFollowedTopicsCTE({
  communityId,
  currentUserId,
}: {
  communityId?: string
  currentUserId: string
}): SQLStatement {
  return sql`/* buildFollowedCTE:fragment */
    followed_topics AS (
      `.append(
    communityId
      ? buildCommunityListTopicsCTE(communityId)
      : sql`SELECT object_id AS topic_id
      FROM relation__user__follow__topic
      WHERE subject_id = ${currentUserId}
        AND deleted_at IS NULL
      UNION
      `.append(buildCommunityListProxyFollowedTopicsCTE(currentUserId)),
  ).append(sql`
    )`)
}

function buildExcludedTopicsCTE(currentUserId: string): SQLStatement {
  return sql`/* buildExcludedCTE:fragment */
    excluded_topics AS (
      SELECT object_id AS topic_id
      FROM relation__user__mute__topic
      WHERE subject_id = ${currentUserId}
        AND deleted_at IS NULL
      UNION
      `.append(buildCommunityListProxyMutedTopicsCTE(currentUserId)).append(sql`
    )`)
}

function buildExcludedUsersCTE(currentUserId: string): SQLStatement {
  return buildExcludedCTE(
    currentUserId,
    {
      relationTable: 'relation__user__mute__user',
      idColumn: 'user_id',
      cteAlias: 'excluded_users',
    },
    ['relation__user__block__user'],
  )
}
