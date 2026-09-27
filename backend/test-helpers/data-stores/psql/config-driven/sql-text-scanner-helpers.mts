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
