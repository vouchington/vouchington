import { readDollarQuoteDelimiter } from './sql-literal-readers.mts'

export function stripSqlComments(sql: string): string {
  let stripped = ''
  let inSingleQuote = false
  let inEscapeString = false
  let dollarQuoteDelimiter: string | null = null
  let blockCommentDepth = 0
  let inLineComment = false

  for (let i = 0; i < sql.length; i++) {
    if (inLineComment) {
      if (sql[i] === '\n') {
        stripped += '\n'
        inLineComment = false
      } else {
        stripped += ' '
      }
      continue
    }

    if (blockCommentDepth > 0) {
      if (sql[i] === '/' && sql[i + 1] === '*') {
        blockCommentDepth++
        stripped += '  '
        i++
      } else if (sql[i] === '*' && sql[i + 1] === '/') {
        blockCommentDepth--
        stripped += '  '
        i++
      } else {
        stripped += sql[i] === '\n' ? '\n' : ' '
      }
      continue
    }

    if (dollarQuoteDelimiter) {
      if (sql.startsWith(dollarQuoteDelimiter, i)) {
        stripped += dollarQuoteDelimiter
        i += dollarQuoteDelimiter.length - 1
        dollarQuoteDelimiter = null
      } else {
        stripped += sql[i]
      }
      continue
    }

    if (inSingleQuote) {
      stripped += sql[i]
      if (inEscapeString && sql[i] === '\\') {
        stripped += sql[i + 1] ?? ''
        i++
      } else if (sql[i] === "'" && sql[i + 1] === "'") {
        stripped += sql[i + 1]
        i++
      } else if (sql[i] === "'") {
        inSingleQuote = false
        inEscapeString = false
      }
      continue
    }

    const delimiter = readDollarQuoteDelimiter(sql, i)
    if (delimiter) {
      dollarQuoteDelimiter = delimiter
      stripped += delimiter
      i += delimiter.length - 1
      continue
    }

    if ((sql[i] === 'E' || sql[i] === 'e') && sql[i + 1] === "'") {
      inSingleQuote = true
      inEscapeString = true
      stripped += sql[i] + sql[i + 1]
      i++
    } else if (sql[i] === "'") {
      inSingleQuote = true
      stripped += sql[i]
    } else if (sql[i] === '-' && sql[i + 1] === '-') {
      inLineComment = true
      stripped += '  '
      i++
    } else if (sql[i] === '/' && sql[i + 1] === '*') {
      blockCommentDepth = 1
      stripped += '  '
      i++
    } else {
      stripped += sql[i]
    }
  }

  return stripped
}

export function maskSqlLiterals(sql: string): string {
  let masked = ''
  let inSingleQuote = false
  let inEscapeString = false
  let dollarQuoteDelimiter: string | null = null

  for (let i = 0; i < sql.length; i++) {
    if (dollarQuoteDelimiter) {
      if (sql.startsWith(dollarQuoteDelimiter, i)) {
        masked += dollarQuoteDelimiter
        i += dollarQuoteDelimiter.length - 1
        dollarQuoteDelimiter = null
      } else {
        masked += sql[i] === '\n' ? '\n' : ' '
      }
      continue
    }

    if (inSingleQuote) {
      masked += sql[i] === '\n' ? '\n' : ' '
      if (inEscapeString && sql[i] === '\\') {
        masked += sql[i + 1] === '\n' ? '\n' : ' '
        i++
      } else if (sql[i] === "'" && sql[i + 1] === "'") {
        masked += ' '
        i++
      } else if (sql[i] === "'") {
        inSingleQuote = false
        inEscapeString = false
      }
      continue
    }

    const delimiter = readDollarQuoteDelimiter(sql, i)
    if (delimiter) {
      dollarQuoteDelimiter = delimiter
      masked += delimiter
      i += delimiter.length - 1
    } else if ((sql[i] === 'E' || sql[i] === 'e') && sql[i + 1] === "'") {
      inSingleQuote = true
      inEscapeString = true
      masked += '  '
      i++
    } else if (sql[i] === "'") {
      inSingleQuote = true
      masked += ' '
    } else {
      masked += sql[i]
    }
  }

  return masked
}

// A DO block that inserts its own claim row with ON CONFLICT DO NOTHING and returns
// early when the claim already existed (IF NOT FOUND THEN RETURN) converges after one
// successful run — every statement after that guard is unreachable on a retry, which
// is a stronger idempotency guarantee than a per-statement WHERE NOT EXISTS. See
// `election_vote_migration_claims` in `utils/legacy-sentiment-zero-vote-repair.mts`.
const CLAIM_GUARDED_EARLY_RETURN =
  /\bON\s+CONFLICT\s+DO\s+NOTHING\s*;\s*IF\s+NOT\s+FOUND\s+THEN\s+RETURN\s*;/is

// This is a textual match, not control-flow analysis, so it must not exempt statements that
// only look unreachable: if the guard sequence itself sits inside a branch or loop that can
// execute zero times (e.g. `IF should_claim THEN <guard> END IF; <insert>`, or the same
// nested in a `WHILE`/`FOR`/`LOOP`/`FOREACH`/`CASE`), that construct can be skipped and the
// "exempt" insert after it runs unguarded on every boot. Every real generator emits the guard
// as the DO body's first statement, so requiring no PL/pgSQL control-flow keyword before the
// match is a safe proxy for "the guard is not itself conditional" without a real parser.
function isClaimGuardDominant(maskedBody: string, guardMatchIndex: number): boolean {
  return !/\b(?:IF|CASE|LOOP|WHILE|FOR|FOREACH)\b/i.test(maskedBody.slice(0, guardMatchIndex))
}

// A claim key built from a computed expression (e.g. `uuidv7()`) produces a different value
// on every retry, so ON CONFLICT never matches and the guard never actually short-circuits —
// unlike a literal key, which is identical across runs. maskSqlLiterals blanks a string
// literal's content, including its surrounding quote characters, to spaces, so a VALUES
// clause built entirely from literals masks to spaces and commas; any other leftover
// character means at least one value is a computed expression, not a stable literal.
function hasStableLiteralClaimKey(maskedBody: string, guardMatchIndex: number): boolean {
  const beforeGuard = maskedBody.slice(0, guardMatchIndex)
  const valuesMatch = /[\s\S]*\bVALUES\s*\(/i.exec(beforeGuard)
  if (!valuesMatch) return false
  const afterOpenParen = beforeGuard.slice(valuesMatch[0].length)
  const closeParenIndex = afterOpenParen.lastIndexOf(')')
  if (closeParenIndex === -1) return false
  return afterOpenParen.slice(0, closeParenIndex).replace(/,/g, '').trim() === ''
}

/**
 * The claim-guard match `findFirstUnguardedInsertViolation` should exempt trailing DO-block
 * statements for, or null when there is no guard, it is not dominant, or its claim key is not
 * a stable literal.
 */
export function findDominantClaimGuardMatch(maskedBody: string): RegExpExecArray | null {
  const guardMatch = CLAIM_GUARDED_EARLY_RETURN.exec(maskedBody)
  if (!guardMatch) return null
  if (!isClaimGuardDominant(maskedBody, guardMatch.index)) return null
  if (!hasStableLiteralClaimKey(maskedBody, guardMatch.index)) return null
  return guardMatch
}
