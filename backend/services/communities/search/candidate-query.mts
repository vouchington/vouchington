import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommunitySortMode } from '../search-types.mts'
import { startTrendingCommunityCandidates } from './trending-candidates.mts'

export function startCommunityCandidates(
  sort: CommunitySortMode,
  hasListItems: boolean,
  limit: number,
  search?: string,
  memberUserId?: string,
): SQLStatement {
  if (sort === 'trending')
    return startTrendingCommunityCandidates(hasListItems, search, memberUserId)
  const listedVirtual = hasListItems && sort === 'virtual_subscriptions'
  // Memberships are the only materialized candidate set. Text stays a correlated probe on the
  // ordered walk so a common term stops at the page in both plan-cache modes.
  const textFromMembers = Boolean(search) && Boolean(memberUserId) && !listedVirtual
  const textFromCounts = Boolean(search) && !memberUserId && sort !== 'name' && !listedVirtual
  const query = sql`/* searchCommunities */ WITH `
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
  appendCandidateFrom(query, { listedVirtual, textFromMembers, textFromCounts, search })
  if (memberUserId && !textFromMembers)
    query.append(sql` JOIN member_matches member_match ON member_match.id = c.id`)
  if (!listedVirtual && !textFromCounts && (sort !== 'name' || hasListItems))
    query.append(sql` JOIN community_search_counts counts ON counts.community_id = c.id`)
  query.append(sql` WHERE c.deleted_at IS NULL`)
  return query
}

function appendCandidateFrom(
  query: SQLStatement,
  options: {
    listedVirtual: boolean
    textFromMembers: boolean
    textFromCounts: boolean
    search?: string
  },
): void {
  const { listedVirtual, textFromMembers, textFromCounts, search } = options
  if (listedVirtual && !search) {
    query.append(sql` FROM community_search_counts counts
      JOIN LATERAL (SELECT * FROM communities c WHERE c.id = counts.community_id) c ON TRUE`)
    return
  }
  if (textFromMembers) {
    query.append(sql` FROM member_matches member_match
      JOIN communities c ON c.id = member_match.id`)
  } else if (listedVirtual || textFromCounts) {
    query.append(sql` FROM community_search_counts counts
      JOIN communities c ON c.id = counts.community_id`)
  } else {
    query.append(sql` FROM communities c`)
  }
  if (search) appendTextProbe(query, search)
}

function appendTextProbe(query: SQLStatement, search: string): void {
  // LIMIT 1 keeps the probe correlated. A bare WHERE or EXISTS is pulled up, and the generic
  // plan then reads every match through the GIN index before sorting. c stays the communities
  // row so ORDER BY c.id matches the driving index.
  query.append(sql` JOIN LATERAL (
    SELECT 1 FROM communities text_match
    WHERE text_match.id = c.id
      AND text_match.search_vector @@ websearch_to_tsquery('voucha_english', ${search})
    LIMIT 1
  ) text_match ON TRUE`)
}
