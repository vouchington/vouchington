import sql, { type SQLStatement } from 'sql-template-strings'

/** Bounded two-row probe: stops at two operative incidents instead of counting all incidents. */
export function hasTwoOperativeRepeatInfringerIncidentsSql(
  accountUserId: SQLStatement,
): SQLStatement {
  return sql`(
    SELECT COUNT(*) FROM (
      SELECT 1 FROM copyright_repeat_infringer_incidents operative_incident
      WHERE operative_incident.account_user_id = `.append(accountUserId)
    .append(sql` AND operative_incident.is_operative
      LIMIT 2
    ) operative_incidents
  ) = 2`)
}
