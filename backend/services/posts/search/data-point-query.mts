import sql, { type SQLStatement } from 'sql-template-strings'
import { appendCommunityArm, appendNullArm } from './data-point-arms.mts'
import type { DataPointCursor, SearchDataPointsOptions } from './data-point-types.mts'

export function buildDataPointPageQuery(
  options: SearchDataPointsOptions,
  cursor: DataPointCursor | null,
  pageSize: number,
  childLimit: number,
): SQLStatement {
  const lookahead = childLimit + 1
  const openCommunity = cursor?.phase === 'community' && cursor.parent_open ? cursor : null
  const resumeSlot = openCommunity ? 1 : 0
  const laterPage = pageSize - resumeSlot
  const laterLimit = laterPage + 1
  const includeNull = !cursor || (cursor.phase === 'null' && cursor.parent_open)
  const query = sql`/* listDataPointPage */
    WITH later_communities AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC)::int AS ord
      FROM (
        SELECT id
        FROM communities
        WHERE deleted_at IS NULL
          AND archived_at IS NULL
          AND visibility = 'public'
          AND `
  if (cursor?.phase === 'community') query.append(sql`id < ${cursor.community_id}::uuid`)
  else query.append(sql`TRUE`)
  query.append(sql`
        ORDER BY id DESC
        LIMIT ${laterLimit}
      ) sliced
    ),
    later_page AS (
      SELECT id, ord
      FROM later_communities
      WHERE ord <= ${laterPage}
    ),
    stats AS (
      SELECT
        (SELECT COUNT(*) > ${laterPage} FROM later_communities) AS parent_has_more,
        (SELECT id FROM later_communities WHERE ord = ${laterPage + 1}) AS next_community_id
    ),
    inspected AS (`)
  let needsUnion = false
  if (includeNull) {
    appendNullArm(query, options, cursor?.parent_open ? cursor.post_id : null, lookahead)
    needsUnion = true
  }
  if (openCommunity) {
    if (needsUnion)
      query.append(sql`
      UNION ALL
      `)
    appendCommunityArm(query, {
      fromSql: sql`communities community`,
      whereSql: sql`WHERE community.id = ${openCommunity.community_id}::uuid
        AND community.deleted_at IS NULL
        AND community.archived_at IS NULL
        AND community.visibility = 'public'`,
      ordSql: sql`0::int`,
      postUpper: openCommunity.post_id,
      options,
      lookahead,
    })
    needsUnion = true
  }
  if (needsUnion)
    query.append(sql`
      UNION ALL
      `)
  appendCommunityArm(query, {
    fromSql: sql`later_page community`,
    whereSql: null,
    ordSql: sql`community.ord`,
    postUpper: null,
    options,
    lookahead,
  })
  query.append(sql`
    )
    SELECT
      inspected.phase,
      inspected.parent_ord,
      inspected.community_id,
      inspected.post_id,
      inspected.title,
      inspected.data_point_vertical,
      inspected.structured_data,
      inspected.eligible,
      stats.parent_has_more,
      stats.next_community_id
    FROM stats
    LEFT JOIN inspected ON TRUE
    ORDER BY inspected.phase DESC NULLS LAST, inspected.parent_ord, inspected.post_id DESC NULLS FIRST`)
  return query
}
