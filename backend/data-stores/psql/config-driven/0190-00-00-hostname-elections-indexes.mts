/**
 * Indexes on url_hostnames that depend on vote columns (votes_score_sort)
 * added by 0000-00-00-entity-elections.mts. Must run in the
 * config-driven phase after elections columns exist, not in migrations/.
 */
import { VOTE_SCHEMA_CONFIGS } from './utils/election-schema-config.mts'

/** loaded by path by the config-driven migration runner */
export default function generateHostnameElectionsIndexes(): string {
  // Verify url_hostnames has elections configured so the vote columns exist.
  const hostnameConfig = VOTE_SCHEMA_CONFIGS.find(c => c.entityTable === 'url_hostnames')
  if (!hostnameConfig) throw new Error('url_hostnames is not configured in VOTE_SCHEMA_CONFIGS')

  return `
-- Serves searchUrlHostnames with sort=trust and a topic filter (topic_id = $1 or ANY):
-- ORDER BY votes_score_sort DESC, id DESC.
CREATE INDEX IF NOT EXISTS idx_url_hostnames__topic_id__votes_score_sort__id
ON url_hostnames (topic_id, votes_score_sort DESC, id DESC)
WHERE topic_id IS NOT NULL;

-- Serves searchUrlHostnames with sort=trust and no topic filter. The generic
-- idx_url_hostnames__votes_score_sort__id orders id ascending, and a listing that filters
-- is_blocked outside the index walks every blocked row ahead of the first unblocked one in a score
-- tie group. Non-administrators always list publicly introduced, unblocked hostnames, so this index
-- holds exactly those rows in the query's order.
CREATE INDEX IF NOT EXISTS idx_url_hostnames__listed_votes_score_sort__id
ON url_hostnames (votes_score_sort DESC, id DESC)
WHERE publicly_introduced_at IS NOT NULL AND NOT is_blocked;

-- Serves getFriendTrustedHostnames: the newest K ballots of each followed user, newest first,
-- without walking that user's whole ballot history.
CREATE INDEX IF NOT EXISTS idx_hostname_votes__user_id__id
ON hostname_votes (user_id, id DESC);
`.trim()
}
