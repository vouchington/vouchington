import sql, { type SQLStatement } from 'sql-template-strings'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export function nativeSourceBounds(scopeId: string): SQLStatement {
  return sql`native_bounds AS (SELECT ${scopeId}::uuid AS publication_scope_id)`
}

/** Keep the scope in the ordered interval so a global trailing-key index cannot win. */
export function nativeSourceRange(
  scopeColumn: string,
  columns: readonly string[],
  cursor: readonly string[] | null,
  textColumn = -1,
): SQLStatement {
  const statement = sql``.append(
    `${scopeColumn} = native_bounds.publication_scope_id AND (${scopeColumn}, ${columns.join(', ')}) `,
  )
  statement.append(cursor === null ? '>=' : '>').append(' (native_bounds.publication_scope_id')
  for (const [index] of columns.entries()) {
    statement.append(sql`, ${cursor?.[index] ?? (index === textColumn ? '' : NIL_UUID)}`)
    if (index !== textColumn) statement.append('::uuid')
  }
  return statement.append(')')
}
