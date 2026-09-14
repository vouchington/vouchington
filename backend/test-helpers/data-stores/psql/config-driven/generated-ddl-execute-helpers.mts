import { splitSqlStatements } from '../../../../data-stores/psql/migration-runner/sql-statements.mts'
import { readSqlLiteralAt, readSqlLiterals } from './sql-literal-readers.mts'
import { maskSqlLiterals, stripSqlComments } from './sql-text-scanner-helpers.mts'

export function executableSqlStrings(sql: string): string[] | null {
  const strings: string[] = []
  for (const statement of splitSqlStatements(sql)) {
    const maskedStatement = maskSqlLiterals(stripSqlComments(statement))
    const execute = /\bEXECUTE\b/is.exec(maskedStatement)
    if (!execute) continue
    const commandStart = execute.index + execute[0].length
    const commandTail = statement.slice(commandStart)
    const commandClause = /\b(?:INTO|USING)\b/is.exec(maskedStatement.slice(commandStart))
    const commandExpression = commandClause
      ? commandTail.slice(0, commandClause.index)
      : commandTail
    if (/^\s*(?:FUNCTION|PROCEDURE)\b/is.test(maskedStatement.slice(commandStart))) continue
    if (!isLiteralOnlyExpression(commandExpression)) return null
    const literals = readSqlLiterals(commandExpression)
    if (literals.length === 0) return null
    strings.push(literals.length > 1 ? literals.join('') : (literals[0] ?? ''))
  }
  return strings
}

function isLiteralOnlyExpression(sql: string): boolean {
  let foundLiteral = false
  for (let i = 0; i < sql.length;) {
    if (/\s/.test(sql[i] ?? '')) {
      i++
    } else if (sql.startsWith('||', i)) {
      i += 2
    } else {
      const literal = readSqlLiteralAt(sql, i)
      if (!literal) return false
      foundLiteral = true
      i = literal.end
    }
  }
  return foundLiteral
}
