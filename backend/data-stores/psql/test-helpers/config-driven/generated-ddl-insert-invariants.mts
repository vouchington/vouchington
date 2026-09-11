import { parseSync } from '@libpg-query/parser'

import { splitSqlStatements } from '../../migration-runner/sql-statements.mts'
import { type TextRange, splitCteSegmentRanges } from './cte-segment-ranges.mts'
import { extractDoBlocks, stripDoBlocks } from './do-block-readers.mts'
import { executableSqlStrings } from './generated-ddl-execute-helpers.mts'
import { hasTopLevelConjunctiveNotExists } from './not-exists-guard-depth.mts'
import { isConvergentOnConflict, isGuardedSelect } from './on-conflict-convergence.mts'
import { nonExecutingWrapperChildren } from './query-wrapper-executability.mts'
import { hasGeneratedArbiterViolation, hasReplayUnsafeTrigger } from './schema-snapshot-facts.mts'
import { maskDoubleQuotedIdentifiers } from './sql-quoted-identifier-mask.mts'
import {
  findDominantClaimGuardMatch,
  maskSqlLiterals,
  stripSqlComments,
} from './sql-text-scanner-helpers.mts'

/**
 * Flags INSERT statements with neither a convergent ON CONFLICT nor a conjunctive NOT EXISTS, at
 * top level or inside a DO block body. Config-driven generators re-run on every worker boot, so
 * an unguarded INSERT throws a duplicate-key error the second time, and an `ON CONFLICT DO
 * UPDATE` whose SET targets accumulate (e.g. `attempts = attempts + 1`) corrupts state on replay.
 *
 * Tracked `.sql` under `config-driven/` is judged by no-mistakes
 * `postgres-idempotent-insert`. This helper covers TypeScript-generated SQL that
 * those `.sql` files never contain.
 */
export function findFirstUnguardedInsertViolation(sql: string): string | null {
  const executableSql = stripSqlComments(sql)
  const blocklessSql = stripDoBlocks(executableSql)

  const topLevelViolation = findFirstUnguardedInsertStatement(blocklessSql)
  if (topLevelViolation) return topLevelViolation

  for (const { body } of extractDoBlocks(executableSql)) {
    const strippedBody = stripSqlComments(body)
    const maskedBody = maskSqlLiterals(strippedBody)
    const dominantGuardMatch = findDominantClaimGuardMatch(maskedBody)
    const scannedBody = dominantGuardMatch
      ? strippedBody.slice(0, dominantGuardMatch.index + dominantGuardMatch[0].length)
      : strippedBody

    const bodyViolation = findFirstUnguardedInsertStatement(scannedBody)
    if (bodyViolation) return bodyViolation
  }

  return null
}

function findFirstUnguardedInsertStatement(sql: string): string | null {
  for (const statement of splitSqlStatements(sql)) {
    const maskedStatement = maskDoubleQuotedIdentifiers(maskSqlLiterals(statement))
    const offendingRange = findUnguardedInsertSegmentRange(statement, maskedStatement)
    if (offendingRange) {
      const maskedSegment = maskedStatement.slice(offendingRange.start, offendingRange.end)
      const insertMatch = /\bINSERT\s+INTO\b/is.exec(maskedSegment)
      // The fallback splitter used inside a DO block has no PL/pgSQL grammar, so a leading
      // BEGIN/DECLARE can end up glued onto the split statement. Slice from the actual INSERT
      // keyword — mapped to the unmasked statement via maskSqlLiterals' offsets — so the
      // reported text is the offending INSERT, not the whole compound statement.
      const reportStart = insertMatch
        ? offendingRange.start + insertMatch.index
        : offendingRange.start
      return statement.slice(reportStart, offendingRange.end).trim()
    }

    // A dynamically executed literal is opaque to the split above one level deeper —
    // mirrors findFirstGeneratedDdlViolation's own EXECUTE-payload recursion.
    for (const executableString of executableSqlStrings(statement) ?? []) {
      const violation = findFirstUnguardedInsertStatement(stripSqlComments(executableString))
      if (violation) return violation
    }
  }
  return null
}

/**
 * A statement is unguarded if any of its own INSERT clauses lacks a convergent ON
 * CONFLICT or NOT EXISTS, evaluated per CTE body (and the final statement after the
 * WITH list) rather than over the whole text — so a guard on one CTE's INSERT cannot
 * mask an unguarded INSERT in a sibling CTE of the same compound statement, e.g.
 * `WITH a AS (INSERT ... ON CONFLICT ...), b AS (INSERT ...) SELECT ...`.
 *
 * `maskedStatement` drives the structural search (CTE splitting, keyword matching) so a
 * guard word inside a string literal or double-quoted identifier is never mistaken for a
 * real guard; `statement` is the unmasked twin, index-aligned by both masking passes,
 * sliced with the same ranges whenever a match needs to be parsed — a masked literal
 * reads as spaces, which is a parse error (e.g. `VALUES ('hi')` -> `VALUES (    )`).
 */
function findUnguardedInsertSegmentRange(
  statement: string,
  maskedStatement: string,
): TextRange | null {
  for (const range of splitCteSegmentRanges(maskedStatement)) {
    const segment = maskedStatement.slice(range.start, range.end)
    if (!/\bINSERT\s+INTO\b/is.test(segment)) continue
    if (isGuardedInsertSegment(statement.slice(range.start, range.end))) continue
    return range
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Recurses into every object/array in the parse tree — including
// withClause.ctes[].CommonTableExpr.ctequery — so a modifying CTE's own INSERT nested
// inside this already-isolated segment is judged independently of its sibling CTEs.
//
// A SQL-standard function body (`LANGUAGE SQL BEGIN ATOMIC ... END`, as opposed to a
// dollar-quoted body) parses into nested statement nodes under CreateFunctionStmt.sql_body
// rather than an opaque string. Defining the function never executes that body; only calling
// it does. Recursing into sql_body would judge the function's own INSERTs as deploy-time
// inserts, even though functions are explicitly supported in config-driven generators.
// Defining the function never executes sql_body. ExplainStmt is excluded below
// too unless ANALYZE runs it; PrepareStmt.query is scanned normally — see that doc.
function collectInsertStmts(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectInsertStmts(item, out)
    return
  }
  if (!isRecord(node)) return
  if (isRecord(node.InsertStmt)) out.push(node.InsertStmt)
  if (isRecord(node.CreateFunctionStmt)) {
    const { sql_body: _sqlBody, ...rest } = node.CreateFunctionStmt
    collectInsertStmts(rest, out)
    return
  }
  const wrapperChildren = nonExecutingWrapperChildren(node)
  if (wrapperChildren) {
    for (const child of wrapperChildren) collectInsertStmts(child, out)
    return
  }
  for (const value of Object.values(node)) collectInsertStmts(value, out)
}

// splitCteSegmentRanges falls back to treating the whole statement as one segment when a
// CTE name doesn't match its bare-identifier header pattern (e.g. a quoted CTE name), so
// a segment reaching here can carry multiple sibling CTEs' INSERTs at once. Judging each
// by its own conflict action alone would wrongly reject a NOT-EXISTS-guarded sibling that
// has no onConflictClause at all — so an insert is guarded by either a convergent ON
// CONFLICT or a conjunctive NOT EXISTS in its own source SELECT's WHERE clause.
function isInsertGuarded(insert: Record<string, unknown>): boolean {
  const onConflict = insert.onConflictClause
  if (isRecord(onConflict)) {
    if (onConflict.action === 'ONCONFLICT_NOTHING') return true
    if (onConflict.action === 'ONCONFLICT_UPDATE') {
      return (
        isConvergentOnConflict(onConflict, insert).convergent &&
        !hasReplayUnsafeTrigger(insert, onConflict) &&
        !hasGeneratedArbiterViolation(insert, onConflict)
      )
    }
  }

  const selectStmt = insert.selectStmt
  return isRecord(selectStmt) && isGuardedSelect(selectStmt.SelectStmt)
}

/**
 * Called for every INSERT-bearing segment, not gated on any guard keyword — splitCteSegmentRanges's
 * whole-statement fallback (e.g. a double-quoted CTE name) can hand this several sibling CTEs'
 * INSERTs at once, and a NOT-EXISTS guard on one sibling can mask an unguarded INSERT elsewhere
 * just as an ON CONFLICT guard can.
 *
 * A segment plucked from inside a DO block body can still fail to parse standalone (a leading
 * PL/pgSQL control-flow token glued on by the fallback splitter); on parse rejection this falls
 * back to a masked text scan. A fragment carrying more than one `INSERT INTO` can never be judged
 * this way — a guard token anywhere in the text (a sibling's `DO NOTHING` or `NOT EXISTS`) could
 * mask an unrelated, unguarded INSERT elsewhere in the fragment — so it fails closed
 * unconditionally. For the single-INSERT case, `DO UPDATE` is checked (and fails the segment)
 * before `DO NOTHING`, matching the static-code-analysis guard's fallback, via the shared
 * `hasTopLevelConjunctiveNotExists` predicate (conjunctive-, paren-depth-zero-only, mirroring the
 * AST path's hasConjunctiveNotExists); both masks keep literal guard text from being mistaken for one.
 *
 * Zero collected inserts after a successful parse means the matched text lives only inside an
 * excluded `CreateFunctionStmt.sql_body` (comments/literals are already stripped or masked) —
 * treat that as guarded, matching `judgeFragment`'s identical branch in the frontend guard.
 */
function isGuardedInsertSegment(unmaskedSegment: string): boolean {
  let parsed: unknown
  try {
    parsed = parseSync(unmaskedSegment)
  } catch {
    const masked = maskDoubleQuotedIdentifiers(maskSqlLiterals(unmaskedSegment))
    const insertCount = masked.match(/\bINSERT\s+INTO\b/gis)?.length ?? 0
    if (insertCount !== 1) return false
    if (/\bDO\s+UPDATE\b/i.test(masked)) return false
    if (/\bDO\s+NOTHING\b/i.test(masked)) return true
    return hasTopLevelConjunctiveNotExists(masked)
  }

  const inserts: Record<string, unknown>[] = []
  collectInsertStmts(parsed, inserts)
  if (inserts.length === 0) return true
  return inserts.every(isInsertGuarded)
}
