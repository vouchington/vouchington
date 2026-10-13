/** Match the SQL recorded by EXPLAIN, including the bounded cursor API's fixed wrapper. */
export function matchesCapturedSql(
  sourceSql: string | null,
  annotation: string,
  capturedSql: string,
): boolean {
  if (!sourceSql) return false
  if (capturedSql.trim() === sourceSql.trim()) return true
  const bounded = `/* ${annotation} */ SELECT * FROM (${sourceSql.trimEnd().replace(/;$/, '')}) bounded_cursor_rows LIMIT $`
  return capturedSql.startsWith(bounded) && /^[1-9]\d*$/.test(capturedSql.slice(bounded.length))
}
