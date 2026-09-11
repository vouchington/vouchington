import path from 'node:path'
import fs from 'node:fs/promises'
import type { AnalyticsTableName } from './tables.mts'

export function getAnalyticsLocalDir(): string {
  return process.env.ANALYTICS_LOCAL_DIR ?? './tmp/analytics'
}

async function tableHasJsonlFiles(table: AnalyticsTableName): Promise<boolean> {
  try {
    const files = await fs.readdir(path.join(getAnalyticsLocalDir(), table))
    return files.some(file => file.endsWith('.jsonl'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

function buildViewSql(table: AnalyticsTableName, hasJsonlFiles: boolean): string {
  if (!hasJsonlFiles) {
    // read_ndjson() throws "IO Error: No files found" on a glob matching zero files, so a stub
    // view is required both when the directory is absent and when it exists but is still empty.
    return `CREATE OR REPLACE VIEW "${table}" AS SELECT * FROM (VALUES (1)) t(x) WHERE 1=0;`
  }
  const glob = path.join(getAnalyticsLocalDir(), table, '*.jsonl')
  // read_ndjson's schema inference auto-promotes shape-matching strings to native types
  // (event_date -> DATE, any UUID-shaped column -> UUID, etc). Views stay untyped here;
  // query.mts reads rows back through getRowObjectsJson() so every native type is converted
  // to a plain JSON primitive uniformly, rather than casting specific known columns here.
  return `CREATE OR REPLACE VIEW "${table}" AS SELECT * FROM read_ndjson('${glob}', ignore_errors=true);`
}

export interface ViewRefreshResult {
  sql: string | undefined
  populatedTables: AnalyticsTableName[]
}

// DuckDB pins a view's column types when it's created; if a JSONL file written after that pins the
// view's schema (e.g. a fresh optional field, or a value shape that widens a column's inferred type
// — a non-UUID string landing in a previously all-UUID column), the next SELECT against it throws
// "Binder Error: Contents of view were altered" instead of picking the new shape up live. Re-issuing
// the identical CREATE OR REPLACE VIEW re-infers the schema from every currently matching file and
// clears the mismatch — see query.mts's retry-on-stale-view handling in query().
export function buildViewRebuildSql(tables: readonly AnalyticsTableName[]): string | undefined {
  if (tables.length === 0) return undefined
  return tables.map(table => buildViewSql(table, true)).join('\n')
}

// DuckDB views aren't snapshotted: once a table's view points at its real read_ndjson() glob, newly
// flushed JSONL files in that directory are picked up automatically on the next SELECT — no DDL
// needed. So callers only need to pass the tables that are still on the empty-table stub view;
// once a table is confirmed populated, it never needs to be checked or rebuilt again, which is what
// keeps this off the hot path for query() once every active table has data.
export async function buildViewRefreshSql(
  tables: readonly AnalyticsTableName[],
): Promise<ViewRefreshResult> {
  const checked = await Promise.all(
    tables.map(async table => ({ table, hasJsonlFiles: await tableHasJsonlFiles(table) })),
  )
  const populatedTables: AnalyticsTableName[] = []
  for (const entry of checked) {
    if (entry.hasJsonlFiles) populatedTables.push(entry.table)
  }
  return {
    populatedTables,
    sql:
      checked.length > 0
        ? checked.map(entry => buildViewSql(entry.table, entry.hasJsonlFiles)).join('\n')
        : undefined,
  }
}
