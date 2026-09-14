import {
  DuckDBInstance,
  DuckDBTypeId,
  type DuckDBConnection,
  type DuckDBResultReader,
  type DuckDBValue,
} from '@duckdb/node-api'
import onError from '@modules/on-error'
import { buildViewRefreshSql, buildViewRebuildSql } from './query-files.mts'
import { parseAnalyticsBackend } from './config.mts'
import { ANALYTICS_TABLES, type AnalyticsTableName } from './tables.mts'

let instancePromise: Promise<DuckDBInstance> | undefined
let connectionPromise: Promise<DuckDBConnection> | undefined

// Tables confirmed to have at least one flushed JSONL file, and therefore already pointed at their
// real read_ndjson() view — DuckDB evaluates that glob live on every SELECT, so once a table is in
// this set it never needs another fs check or CREATE VIEW call for the life of the connection.
const populatedTables = new Set<AnalyticsTableName>()

function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    instancePromise = DuckDBInstance.create(':memory:')
    connectionPromise = instancePromise.then(instance => instance.connect())
  }
  return connectionPromise
}

async function refreshPendingViews(connection: DuckDBConnection): Promise<void> {
  const pending = ANALYTICS_TABLES.filter(table => !populatedTables.has(table))
  if (pending.length === 0) return
  const { sql, populatedTables: newlyPopulated } = await buildViewRefreshSql(pending)
  if (sql) await connection.run(sql)
  newlyPopulated.forEach(table => populatedTables.add(table))
}

// Two independent reasons this queue can't be dropped once every table is populated:
// 1. A single DuckDBConnection runs one statement at a time — issuing overlapping run()/
//    runAndReadAll() calls on the same connection object is not safe, so serializing here isn't
//    just about views, it's how a single shared connection is used correctly at all. Real
//    concurrency would need one connection per caller (via DuckDBInstance.connect()), which is a
//    bigger change than this queue buys back.
// 2. The connection's views are also global, mutable catalog state: refreshPendingViews() can
//    replace a pending table's stub view with its real one. Callers like getLandingPageAnalytics
//    fire several query() calls concurrently via Promise.all — without serializing here, one
//    call's view swap can happen out from under another call's still-running select.
// Chaining every call through this queue makes each refresh-then-select pair atomic from every
// other caller's perspective, and keeps every statement on the shared connection sequential.
let queryQueue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queryQueue.then(task, task)
  queryQueue = result.then(() => undefined, onError)
  return result
}

// DuckDB's JSON-typed BIGINT/UBIGINT/HUGEINT/UHUGEINT/BIGNUM values are stringified (they can
// exceed Number's safe range), but every value this pipeline produces is a small aggregate
// (COUNT, etc) — keep the plain-number contract callers already rely on via Number(...).
const BIGINT_FAMILY_TYPE_IDS: ReadonlySet<DuckDBTypeId> = new Set([
  DuckDBTypeId.BIGINT,
  DuckDBTypeId.UBIGINT,
  DuckDBTypeId.HUGEINT,
  DuckDBTypeId.UHUGEINT,
  DuckDBTypeId.BIGNUM,
])

// read_ndjson's schema inference auto-promotes shape-matching strings to native DuckDB types
// (UUID, DATE, TIMESTAMP, ...), not just BIGINT aggregates. getRowObjectsJson() converts every
// native type to a plain JSON primitive uniformly (the same conversion `duckdb --json` used to
// do for us) — re-widen only the BIGINT-family columns back to `number` afterward.
function denormalizeRows<T>(reader: DuckDBResultReader): T[] {
  const bigintColumns: string[] = []
  reader.columnNames().forEach((name, index) => {
    if (BIGINT_FAMILY_TYPE_IDS.has(reader.columnType(index).typeId)) bigintColumns.push(name)
  })
  const rows = reader.getRowObjectsJson()
  if (bigintColumns.length === 0) return rows as T[]
  return rows.map(row => {
    for (const name of bigintColumns) {
      if (typeof row[name] === 'string') row[name] = Number(row[name])
    }
    return row as T
  })
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: DuckDBValue[] = [],
): Promise<T[]> {
  const backend = parseAnalyticsBackend(process.env.ANALYTICS_BACKEND ?? 'disabled')
  if (backend !== 'local') return []
  try {
    return await enqueue(async () => {
      const connection = await getConnection()
      const pending = ANALYTICS_TABLES.filter(table => !populatedTables.has(table))
      await refreshPendingViews(connection)
      try {
        const reader = await connection.runAndReadAll(sql, params)
        return denormalizeRows<T>(reader)
      } catch (err) {
        if (isStaleViewError(err)) {
          const rebuildSql = buildViewRebuildSql([...populatedTables])
          if (rebuildSql) await connection.run(rebuildSql)
          const reader = await connection.runAndReadAll(sql, params)
          return denormalizeRows<T>(reader)
        }
        throw tagIfExpectedEmptyTableError(err, sql, pending)
      }
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err), { cause: err }))
    return []
  }
}

export async function refreshViews(): Promise<void> {
  if (!connectionPromise) return
  await enqueue(async () => {
    const connection = await getConnection()
    await refreshPendingViews(connection)
  })
}

export async function closeConnection(): Promise<void> {
  if (!connectionPromise || !instancePromise) return
  // Routed through the same queue as query(): tearing down outside it could disconnect a
  // connection a query enqueued just before this call hasn't started running against yet.
  await enqueue(async () => {
    if (!connectionPromise || !instancePromise) return
    const [instance, connection] = await Promise.all([instancePromise, connectionPromise])
    connectionPromise = undefined
    instancePromise = undefined
    populatedTables.clear()
    connection.disconnectSync()
    instance.closeSync()
  })
}

// DuckDB pins a view's column set/types when it's (re)created — see buildViewRebuildSql's doc in
// query-files.mts. A once-populated table's view is otherwise never rebuilt, so this only fires on
// the rare occasion a table's schema actually drifted, not on the hot path.
function isStaleViewError(err: unknown): boolean {
  return (
    err instanceof Error && err.message.startsWith('Binder Error: Contents of view were altered')
  )
}

// DuckDB's stub view for a still-empty table only exposes a dummy `x` column, so any real query
// against a table that has no data yet raises a Binder Error ("Referenced column ... not found") —
// an expected, benign outcome (the caller already gets [] either way), not a bug worth alerting on.
// Scope the suppression to tables that were still pending *before* this call's refresh, so a real
// Binder Error against an already-populated table (an actual typo'd column, say) still logs normally.
function tagIfExpectedEmptyTableError(
  err: unknown,
  sql: string,
  pendingTables: AnalyticsTableName[],
): Error {
  const error = err instanceof Error ? err : new Error(String(err), { cause: err })
  const isBinderError = error.message.startsWith('Binder Error')
  const referencesPendingTable = pendingTables.some(table => sql.includes(table))
  if (isBinderError && referencesPendingTable) {
    const extendedError = error as Error & { tags?: Record<string, boolean> }
    extendedError.tags = { ...extendedError.tags, suppressLogging: true }
  }
  return error
}
