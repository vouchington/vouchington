const dollarQuoteDelimiterPattern = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y

export interface SqlLiteral {
  end: number
  text: string
}

export function readDollarQuoteDelimiter(sql: string, index: number): string | null {
  if (sql[index] !== '$') return null
  if (/[A-Za-z0-9_$]/.test(sql[index - 1] ?? '')) return null

  dollarQuoteDelimiterPattern.lastIndex = index
  return dollarQuoteDelimiterPattern.exec(sql)?.[0] ?? null
}

export function readSqlLiteralAt(sql: string, index: number): SqlLiteral | null {
  if ((sql[index] === 'E' || sql[index] === 'e') && sql[index + 1] === "'") {
    return readSingleQuotedLiteralAt(sql, index, true)
  }
  if (sql[index] === "'") return readSingleQuotedLiteralAt(sql, index)

  const delimiter = readDollarQuoteDelimiter(sql, index)
  if (!delimiter) return null

  const bodyStart = index + delimiter.length
  const bodyEnd = sql.indexOf(delimiter, bodyStart)
  if (bodyEnd === -1) return null

  return {
    end: bodyEnd + delimiter.length,
    text: sql.slice(bodyStart, bodyEnd),
  }
}

export function readAdjacentSqlLiteralsAt(sql: string, index: number): SqlLiteral | null {
  const firstLiteral = readSqlLiteralAt(sql, index)
  if (!firstLiteral) return null

  let end = firstLiteral.end
  let text = firstLiteral.text
  while (true) {
    const separator = /^\s+/.exec(sql.slice(end))?.[0] ?? ''
    if (!separator) break

    const nextLiteral = readSqlLiteralAt(sql, end + separator.length)
    if (!nextLiteral) break

    end = nextLiteral.end
    text += nextLiteral.text
  }

  return { end, text }
}

export function readSqlLiterals(sql: string): string[] {
  const strings: string[] = []
  for (let i = 0; i < sql.length; i++) {
    const literal = readSqlLiteralAt(sql, i)
    if (!literal) continue

    strings.push(literal.text)
    i = literal.end - 1
  }
  return strings
}

function readSingleQuotedLiteralAt(
  sql: string,
  index: number,
  isEscapeString = false,
): SqlLiteral | null {
  let text = ''
  for (let i = index + (isEscapeString ? 2 : 1); i < sql.length; i++) {
    if (isEscapeString && sql[i] === '\\') {
      text += sql[i + 1] ?? ''
      i++
    } else if (sql[i] === "'" && sql[i + 1] === "'") {
      text += "'"
      i++
    } else if (sql[i] === "'") {
      return { end: i + 1, text }
    } else {
      text += sql[i]
    }
  }
  return null
}
