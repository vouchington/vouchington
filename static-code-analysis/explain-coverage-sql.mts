export function isRead(sqlText: string | null): boolean {
  if (!sqlText) return false
  let statement = sqlText.trimStart()
  for (;;) {
    const withoutComment = statement
      .replace(/^(?:\/\*[\s\S]*?\*\/|--[^\r\n]*(?:\r\n?|\n|$))/, '')
      .trimStart()
    if (withoutComment === statement) break
    statement = withoutComment
  }
  if (/^(?:SELECT|TABLE)\b/i.test(statement)) return true
  return (
    /^WITH\b/i.test(statement) &&
    !/\bsql_placeholder_\d+\b/i.test(statement) &&
    !/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(
      statement.replace(/\bFOR\s+(?:NO\s+KEY\s+)?UPDATE\b/gi, ''),
    )
  )
}

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
