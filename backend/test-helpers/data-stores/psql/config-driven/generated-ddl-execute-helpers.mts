import { parsePostgresSql, type PostgresSqlStatement } from 'no-mistakes'
import { readStringLiteral } from 'vouchington-tooling/sql-scanner'

import { maskSqlLiterals, stripSqlComments } from './sql-text-scanner-helpers.mts'

type ExecutableSqlSelector = (fragment: string) => string[] | null

/** Parse a complete, comment-stripped source before the legacy splitter creates partial PL/pgSQL
 * fragments. The returned selector matches those fragments to the parser's source occurrences. */
export async function loadExecutableSqlStrings(fullSql: string): Promise<ExecutableSqlSelector> {
  const facts = await parsePostgresSql({ sql: fullSql })
  const records: { sourceSql: string; decodedSql: string | null | undefined }[] = []

  function collect(
    statements: readonly PostgresSqlStatement[],
    enclosingEncoding: 'dollarQuoted' | 'singleQuoted' | 'escapedString' = 'dollarQuoted',
  ): void {
    for (const statement of statements) {
      const sourceSql = decodedSourceSql(statement.sql, enclosingEncoding)
      if (sourceSql === undefined) continue
      if (statement.kind === 'literalExecute') {
        records.push({
          sourceSql,
          decodedSql: statement.execute.decodedSql,
        })
      } else if (
        statement.kind === 'other' &&
        /\bEXECUTE\b/i.test(maskSqlLiterals(statement.sql))
      ) {
        records.push({ sourceSql, decodedSql: null })
      } else if (statement.kind === 'createTrigger') {
        // CREATE TRIGGER ... EXECUTE FUNCTION names a function; it is not dynamic SQL.
        records.push({ sourceSql, decodedSql: undefined })
      } else if (statement.kind === 'doBlock') {
        collect(statement.block.statements, statement.block.bodyEncoding)
      } else if (statement.kind === 'conditional') {
        for (const branch of statement.branches) collect(branch.statements, enclosingEncoding)
      }
    }
  }

  collect(facts.statements)

  return fragment => {
    const strings: string[] = []
    const visibleSql = maskSqlLiterals(fragment)
    let matched = false
    for (const { sourceSql, decodedSql } of records) {
      let occurrence = fragment.indexOf(sourceSql)
      while (occurrence !== -1 && visibleSql[occurrence] !== sourceSql[0]) {
        occurrence = fragment.indexOf(sourceSql, occurrence + 1)
      }
      if (occurrence === -1) continue
      matched = true
      if (decodedSql === null) return null
      if (decodedSql !== undefined) strings.push(decodedSql)
    }
    if (!matched && /\bEXECUTE\b/i.test(visibleSql)) return null
    return strings
  }
}

function decodedSourceSql(
  sql: string,
  enclosingEncoding: 'dollarQuoted' | 'singleQuoted' | 'escapedString',
): string | undefined {
  const decoded =
    enclosingEncoding === 'dollarQuoted'
      ? sql
      : readStringLiteral(`${enclosingEncoding === 'escapedString' ? 'E' : ''}'${sql}'`, 0)?.text
  return decoded === undefined ? undefined : stripSqlComments(decoded).trim().replace(/;\s*$/, '')
}
