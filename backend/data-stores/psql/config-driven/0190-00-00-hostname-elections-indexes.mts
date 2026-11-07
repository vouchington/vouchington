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
-- ORDER BY votes_score_sort DESC, id DESC. Unfiltered sort=trust is served by
-- idx_url_hostnames__votes_score_sort__id.
CREATE INDEX IF NOT EXISTS idx_url_hostnames__topic_id__votes_score_sort__id
ON url_hostnames (topic_id, votes_score_sort DESC, id DESC)
WHERE topic_id IS NOT NULL;
`.trim()
}
