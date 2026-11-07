import sql, { type SQLStatement } from 'sql-template-strings'
import { buildExcludedCTE, buildHiddenCTE } from '../../sql-builders/index.mts'

export function appendPersonalizedExclusionCTEs(
  query: SQLStatement,
  currentUserId: string | undefined,
  communityId?: string,
): SQLStatement {
  const userId = currentUserId ?? null
  query.append(sql`viewer_scope AS MATERIALIZED (
    SELECT ${userId}::uuid AS user_id, ${communityId ?? null}::uuid AS community_id,
      EXISTS (SELECT 1 FROM relation__user__proxy_follow__community proxy
        WHERE proxy.subject_id = ${userId}::uuid AND proxy.deleted_at IS NULL) AS has_proxy_follow,
      EXISTS (SELECT 1 FROM relation__user__proxy_mute__community proxy
        WHERE proxy.subject_id = ${userId}::uuid AND proxy.deleted_at IS NULL) AS has_proxy_mute
  ), `)
  query.append(
    currentUserId
      ? buildExcludedCTE(
          currentUserId,
          {
            relationTable: 'relation__user__mute__user',
            idColumn: 'user_id',
            cteAlias: 'excluded_users',
          },
          ['relation__user__block__user'],
        )
      : sql`excluded_users AS (SELECT NULL::uuid AS user_id WHERE FALSE)`,
  )
  query.append(sql`, `)
  query.append(
    currentUserId
      ? buildHiddenCTE(currentUserId, {
          relationTable: 'relation__user__hide__rss_feed_item',
          idColumn: 'rss_feed_item_id',
          cteAlias: 'hidden_items',
        })
      : sql`hidden_items AS (SELECT NULL::uuid AS rss_feed_item_id WHERE FALSE)`,
  )
  return query.append(sql`, excluded_hostnames AS NOT MATERIALIZED (
    SELECT hostname.reversed_hostname FROM relation__user__block__url_hostname blocked
    JOIN url_hostnames hostname ON hostname.id = blocked.object_id
    WHERE blocked.subject_id = ${userId}::uuid AND blocked.deleted_at IS NULL
    UNION
    SELECT hostname.reversed_hostname FROM relation__user__mute__url_hostname muted
    JOIN url_hostnames hostname ON hostname.id = muted.object_id
    WHERE muted.subject_id = ${userId}::uuid AND muted.deleted_at IS NULL
  )`)
}
