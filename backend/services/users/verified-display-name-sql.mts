import sql, { type SQLStatement } from 'sql-template-strings'

/** Projects the public verified name of a users row, respecting the badge and name settings. */
export function verifiedDisplayNameSql(alias: string): SQLStatement {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error('Invalid user SQL alias')

  return sql``.append(`CASE
    WHEN ${alias}.verification_status = 'verified' AND ${alias}.is_verified_badge_visible THEN
      CASE ${alias}.public_verified_name_display
        WHEN 'first_name' THEN ${alias}.verified_first_name
        WHEN 'first_name_last_initial' THEN
          COALESCE(${alias}.verified_first_name || ' ' || ${alias}.verified_last_name_initial || '.',
            ${alias}.verified_first_name)
        WHEN 'full_name' THEN ${alias}.verified_full_name
        ELSE NULL
      END
    ELSE NULL
  END`)
}
