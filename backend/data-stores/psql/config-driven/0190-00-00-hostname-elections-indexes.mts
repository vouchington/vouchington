/**
 * Indexes on url_hostnames that depend on vote columns (votes_score_net,
 * votes_count_up) added by 0000-00-00-entity-elections.mts. Must run in the
 * config-driven phase after elections columns exist, not in migrations/.
 */
import { VOTE_SCHEMA_CONFIGS } from './utils/election-schema-config.mts'

export default function generateHostnameElectionsIndexes(): string {
  // Verify url_hostnames has elections configured so the vote columns exist.
  const hostnameConfig = VOTE_SCHEMA_CONFIGS.find(c => c.entityTable === 'url_hostnames')
  if (!hostnameConfig) throw new Error('url_hostnames is not configured in VOTE_SCHEMA_CONFIGS')

  return `
-- Partial index supporting searchTopHostnames without topic_id filter:
-- ORDER BY votes_score_net DESC, id DESC
-- WHERE blocked IS NOT TRUE AND votes_count_up > 0
CREATE INDEX IF NOT EXISTS idx_url_hostnames__top_sort
ON url_hostnames (votes_score_net DESC, id DESC)
WHERE blocked IS NOT TRUE AND votes_count_up > 0;

-- Partial index supporting searchTopHostnames with topic_id filter:
-- ORDER BY votes_score_net DESC, id DESC
-- WHERE blocked IS NOT TRUE AND votes_count_up > 0 AND topic_id = $1
CREATE INDEX IF NOT EXISTS idx_url_hostnames__top_sort_by_topic
ON url_hostnames (topic_id, votes_score_net DESC, id DESC)
WHERE blocked IS NOT TRUE AND votes_count_up > 0 AND topic_id IS NOT NULL;
`.trim()
}
