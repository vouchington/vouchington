import { parseSync, type RangeVar } from '@libpg-query/parser'

/**
 * Returns a PostgreSQL-quoted identifier. Simple lowercase names are returned unquoted;
 * names containing uppercase, spaces, punctuation, or other special characters are
 * wrapped in double-quotes with internal double-quotes escaped as "".
 */
function quotePgName(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name)) return name
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Builds the qualified view reference (schema.view or just view) from the
 * unquoted identifiers the parser returns.
 */
function buildViewRef(view: RangeVar & { relname: string }): string {
  const name = quotePgName(view.relname)
  if (!view.schemaname) return name
  return `${quotePgName(view.schemaname)}.${name}`
}

/**
 * Extracts the qualified names of all views declared by CREATE [OR REPLACE] VIEW
 * statements in the given SQL string. Comments and string literals are ignored
 * (the real PostgreSQL 18 parser handles all quoting and comment forms correctly).
 *
 * Requires loadSqlParserModule() from sql-statements.mts to have resolved
 * before the first call.
 */
export function extractViewNames(sql: string): string[] {
  if (!sql.trim()) return []
  let result
  try {
    result = parseSync(sql)
  } catch {
    return []
  }
  const names: string[] = []
  for (const stmt of result.stmts ?? []) {
    const node = stmt.stmt
    if (!node || !('ViewStmt' in node)) continue
    const view = node.ViewStmt.view
    if (!view?.relname) continue
    names.push(buildViewRef(view as RangeVar & { relname: string }))
  }
  return names
}

export function buildDropViewsStatement(viewNames: string[]): string | null {
  const uniqueViewNames = [...new Set(viewNames)]
  if (uniqueViewNames.length === 0) return null
  return `DROP VIEW IF EXISTS ${uniqueViewNames.join(', ')};`
}
