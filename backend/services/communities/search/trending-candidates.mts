import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * The candidate query for sort=trending: the materialized 30-day score joined to communities,
 * before the shared filters, hydration and keyset tail. Only the filters that exist for it apply:
 * q, member_id and has_list_items. The shared tail orders by (trending_score, id) with a keyset
 * cursor inside this CTE, so the ranking index on mv_trending_communities serves the page.
 */
export function startTrendingCommunityCandidates(
  hasListItems: boolean,
  search?: string,
  memberUserId?: string,
): SQLStatement {
  const query = sql`/* searchCommunities */ WITH `
  if (search)
    query.append(sql`search_matches AS MATERIALIZED (
      SELECT id FROM communities
      WHERE deleted_at IS NULL
        AND search_vector @@ websearch_to_tsquery('voucha_english', ${search})
    ), `)
  if (memberUserId)
    query.append(sql`member_matches AS MATERIALIZED (
      SELECT community_id AS id FROM community_members
      WHERE user_id = ${memberUserId} AND removed_at IS NULL
    ), `)
  query.append(sql`candidate_communities AS MATERIALIZED (
      SELECT c.id, c.name, trending.trending_score
      FROM mv_trending_communities trending
      JOIN communities c ON c.id = trending.id`)
  if (search) query.append(sql` JOIN search_matches matched ON matched.id = c.id`)
  if (memberUserId) query.append(sql` JOIN member_matches member_match ON member_match.id = c.id`)
  if (hasListItems)
    query.append(sql` JOIN community_search_counts counts ON counts.community_id = c.id`)
  return query.append(sql` WHERE c.deleted_at IS NULL`)
}
