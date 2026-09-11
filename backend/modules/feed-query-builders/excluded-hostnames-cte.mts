import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Builds two CTEs for hostname exclusion based on a user's blocked/muted hostnames.
 *
 * - `excluded_hostnames`: collects reversed_hostname values from the user's block + mute relations
 * - `excluded_hostname_ids`: expands to all hostname IDs that match (including subdomains)
 *   and also includes site-wide blocked hostnames (blocked = TRUE)
 *
 * Subdomain matching: blocking "example.com" also blocks "sub.example.com".
 * Uses reversed_hostname (e.g. "com.example") so subdomain checks become
 * prefix LIKE matches, which the text_pattern_ops index handles efficiently.
 */
export function buildExcludedHostnameIdsCTE(userId: string): SQLStatement {
  return sql`/* buildExcludedHostnameIdsCTE:fragment */
    excluded_hostnames AS (
      SELECT uh.reversed_hostname
      FROM relation__user__block__url_hostname rel
      JOIN url_hostnames uh ON uh.id = rel.object_id
      WHERE rel.subject_id = ${userId} AND rel.deleted_at IS NULL
      UNION ALL
      SELECT uh.reversed_hostname
      FROM relation__user__mute__url_hostname rel
      JOIN url_hostnames uh ON uh.id = rel.object_id
      WHERE rel.subject_id = ${userId} AND rel.deleted_at IS NULL
    ),
    excluded_hostname_ids AS (
      SELECT DISTINCT uh.id AS hostname_id
      FROM excluded_hostnames eh
      JOIN url_hostnames uh ON uh.reversed_hostname = eh.reversed_hostname
        OR uh.reversed_hostname LIKE eh.reversed_hostname || '.%'
      UNION ALL
      SELECT id AS hostname_id FROM url_hostnames WHERE blocked = TRUE
    )`
}

/**
 * Builds two CTEs for hostname exclusion based on a community's muted hostnames.
 *
 * - `community_excluded_hostnames`: collects reversed_hostname values from the community's mute relations
 * - `excluded_hostname_ids`: expands to all hostname IDs that match (including subdomains)
 *   and also includes site-wide blocked hostnames (blocked = TRUE)
 */
/** @public SQL builder fragment for community feed query composition */
export function buildCommunityExcludedHostnameIdsCTE(communityId: string): SQLStatement {
  return sql`/* buildCommunityExcludedHostnameIdsCTE:fragment */
    community_excluded_hostnames AS (
      SELECT uh.reversed_hostname
      FROM relation__community__mute__url_hostname rel
      JOIN url_hostnames uh ON uh.id = rel.object_id
      WHERE rel.subject_id = ${communityId} AND rel.deleted_at IS NULL
    ),
    excluded_hostname_ids AS (
      SELECT DISTINCT uh.id AS hostname_id
      FROM community_excluded_hostnames eh
      JOIN url_hostnames uh ON uh.reversed_hostname = eh.reversed_hostname
        OR uh.reversed_hostname LIKE eh.reversed_hostname || '.%'
      UNION ALL
      SELECT id AS hostname_id FROM url_hostnames WHERE blocked = TRUE
    )`
}
