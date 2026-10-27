/** Reader membership scan. `sourceIdSql` is `$1` or a validated integer literal. */
export function sourceMembershipOrderSql(sourceIdSql: string): string {
  return `SELECT domain FROM blocklisted_domains
          WHERE source_id = ${sourceIdSql}::bigint
          ORDER BY domain COLLATE "C"`
}
