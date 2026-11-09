import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Excludes a candidate hostname when the viewer blocked or muted its exact hostname
 * or a parent hostname. Relation rows are looked up per candidate; the query does
 * not expand each excluded parent into every matching hostname in the database.
 */
export function buildHostnameExclusionExists(
  userId: string,
  candidateHostnameId: SQLStatement,
  candidateReversedHostname: SQLStatement,
): SQLStatement {
  return sql`EXISTS (
    SELECT 1
    FROM (
      SELECT subject_id, object_id AS hostname_id
      FROM relation__user__block__url_hostname
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      UNION ALL
      SELECT subject_id, object_id AS hostname_id
      FROM relation__user__mute__url_hostname
      WHERE subject_id = ${userId} AND deleted_at IS NULL
    ) excluded_hostname
    JOIN url_hostnames parent_hostname ON parent_hostname.id = excluded_hostname.hostname_id
    WHERE excluded_hostname.subject_id = ${userId}
      AND (parent_hostname.id = `
    .append(candidateHostnameId)
    .append(sql` OR `)
    .append(candidateReversedHostname).append(sql` LIKE parent_hostname.reversed_hostname || '.%')
  )`)
}
