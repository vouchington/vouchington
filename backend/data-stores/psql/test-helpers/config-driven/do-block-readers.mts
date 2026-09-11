import { splitSqlStatements } from '../../migration-runner/sql-statements.mts'
import { readAdjacentSqlLiteralsAt, readDollarQuoteDelimiter } from './sql-literal-readers.mts'

export function stripDoBlocks(sql: string): string {
  let blocklessSql = sql
  for (const block of extractDoBlocks(sql)) {
    blocklessSql = blocklessSql.replace(block.text, '')
  }
  return blocklessSql
}

export function extractDoBlocks(sql: string): { text: string; body: string }[] {
  return splitSqlStatements(sql).flatMap(statement => {
    const header = /^\s*DO(?:\s+LANGUAGE\s+(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_]*))?\s*/i.exec(
      statement,
    )
    if (!header) return []

    const delimiter = readDollarQuoteDelimiter(statement, header[0].length)
    if (!delimiter) {
      const body = readAdjacentSqlLiteralsAt(statement, header[0].length)
      return body ? [{ text: statement, body: body.text }] : []
    }

    const bodyStart = header[0].length + delimiter.length
    const bodyEnd = statement.indexOf(delimiter, bodyStart)
    if (bodyEnd === -1) return []
    return [{ text: statement, body: statement.slice(bodyStart, bodyEnd) }]
  })
}
