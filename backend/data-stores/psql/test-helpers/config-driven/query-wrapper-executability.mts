function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * Whether an `ExplainStmt.options` list enables `ANALYZE` — the one `EXPLAIN` form that
 * actually executes its nested statement. Verified against @libpg-query/parser: a bare
 * `EXPLAIN ANALYZE`/`EXPLAIN (ANALYZE)` produces a `DefElem { defname: "analyze" }` with no
 * `arg`; an explicit `EXPLAIN (ANALYZE false)` produces the same `DefElem` with
 * `arg.String.sval` holding the literal boolean text. Any other `arg` shape is treated as
 * ANALYZE-enabled — fail closed by scanning the nested statement rather than silently
 * excluding it.
 */
const FALSY_BOOL_ARGS = new Set(['false', 'f', 'no', 'n', 'off', '0'])

export function isExplainAnalyzeEnabled(options: unknown): boolean {
  if (!Array.isArray(options)) return false
  for (const option of options) {
    if (!isRecord(option) || !isRecord(option.DefElem)) continue
    const defElem = option.DefElem
    if (defElem.defname !== 'analyze') continue
    const arg = defElem.arg
    if (!isRecord(arg) || !isRecord(arg.String) || typeof arg.String.sval !== 'string') return true
    return !FALSY_BOOL_ARGS.has(arg.String.sval.toLowerCase())
  }
  return false
}

/**
 * `node.ExplainStmt`, if present, nests a `query` that a collectInsertStmts-shaped walk must
 * not treat as deploy-time-executing unless ANALYZE runs it. Returns the child nodes such a
 * walk should still recurse into (the wrapper's non-`query` fields, plus `query` itself only
 * when it does execute), or undefined when `node` is not this wrapper.
 *
 * `PrepareStmt.query` is deliberately NOT excluded here: unlike EXPLAIN, whether a prepared
 * statement ever runs depends on a separate, later `EXECUTE` statement that this per-statement
 * walk cannot see — splitSqlStatements parses each top-level statement independently, with no
 * cross-statement state. Excluding it unconditionally let an executed `PREPARE ... AS INSERT`
 * pass unscanned (PRRT_kwDOQSARn86ftPcV); scanning it unconditionally fails closed instead, at
 * the cost of also flagging a `PREPARE` that is never `EXECUTE`d — a combination this guard's
 * corpus does not contain.
 */
export function nonExecutingWrapperChildren(node: Record<string, unknown>): unknown[] | undefined {
  if (isRecord(node.ExplainStmt)) {
    const { query, options, ...rest } = node.ExplainStmt
    return isExplainAnalyzeEnabled(options) ? [query, rest] : [rest]
  }
  return undefined
}
