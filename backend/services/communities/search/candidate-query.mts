import sql from 'sql-template-strings'
import type { CommunitySortMode } from '../search-types.mts'

export function startCommunityCandidates(
  sort: CommunitySortMode,
  hasListItems: boolean,
  limit: number,
  search?: string,
  memberUserId?: string,
): ReturnType<typeof sql> {
  const listedVirtual = hasListItems && sort === 'virtual_subscriptions'
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
  if (listedVirtual) {
    query.append(sql`search_input AS MATERIALIZED (SELECT ${limit + 1}::int AS page_limit),
      candidate_communities AS MATERIALIZED (
        SELECT picked.* FROM search_input CROSS JOIN LATERAL (
          SELECT c.id, c.name`)
  } else {
    query.append(sql`candidate_communities AS MATERIALIZED (SELECT c.id, c.name`)
  }
  if (sort !== 'name') query.append(sql`, counts.member_count, counts.virtual_subscription_count`)
  if (listedVirtual) {
    query.append(sql` FROM community_search_counts counts
      JOIN LATERAL (SELECT * FROM communities c WHERE c.id = counts.community_id) c ON TRUE`)
    if (search) query.append(sql` JOIN search_matches matched ON matched.id = c.id`)
  } else if (search) {
    query.append(sql` FROM search_matches matched
      JOIN LATERAL (SELECT * FROM communities c WHERE c.id = matched.id LIMIT 1) c ON TRUE`)
  } else {
    query.append(sql` FROM communities c`)
  }
  if (memberUserId) query.append(sql` JOIN member_matches member_match ON member_match.id = c.id`)
  if (!listedVirtual && (sort !== 'name' || hasListItems))
    query.append(sql` JOIN community_search_counts counts ON counts.community_id = c.id`)
  query.append(sql` WHERE c.deleted_at IS NULL`)
  return query
}
