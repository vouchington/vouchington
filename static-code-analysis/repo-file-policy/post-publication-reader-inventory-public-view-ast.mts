import { isRecord } from './unknown-record.mts'

export function nestedSelectsInFromClause(value: unknown): Record<string, unknown>[] {
  const selects: Record<string, unknown>[] = []
  function collect(fromClause: unknown): void {
    if (Array.isArray(fromClause)) {
      for (const item of fromClause) collect(item)
      return
    }
    if (!isRecord(fromClause)) return
    if (isRecord(fromClause.RangeSubselect) && isRecord(fromClause.RangeSubselect.subquery)) {
      if (isRecord(fromClause.RangeSubselect.subquery.SelectStmt)) {
        selects.push(fromClause.RangeSubselect.subquery.SelectStmt)
      }
      return
    }
    if (isRecord(fromClause.JoinExpr)) {
      collect(fromClause.JoinExpr.larg)
      collect(fromClause.JoinExpr.rarg)
    }
  }
  collect(value)
  return selects
}

export function nestedSelectStatements(value: unknown): Record<string, unknown>[] {
  const selects: Record<string, unknown>[] = []
  function collect(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) collect(item)
      return
    }
    if (!isRecord(node)) return
    if (isRecord(node.SelectStmt)) {
      selects.push(node.SelectStmt)
      return
    }
    for (const child of Object.values(node)) collect(child)
  }
  collect(value)
  return selects
}

export function containsEligibilityPostEquality(
  values: unknown[],
  aliases: { eligibility: Set<string>; posts: Set<string> },
): boolean {
  function collect(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(collect)
    if (!isRecord(value)) return false
    if (
      isRecord(value.BoolExpr) &&
      (value.BoolExpr.boolop === 'OR_EXPR' || value.BoolExpr.boolop === 'NOT_EXPR')
    ) {
      return false
    }
    if (isRecord(value.A_Expr) && value.A_Expr.kind === 'AEXPR_OP' && isEquals(value.A_Expr)) {
      const left = columnReference(value.A_Expr.lexpr)
      const right = columnReference(value.A_Expr.rexpr)
      if (
        (isEligibilityPostId(left, aliases.eligibility) && isPostId(right, aliases.posts)) ||
        (isEligibilityPostId(right, aliases.eligibility) && isPostId(left, aliases.posts))
      ) {
        return true
      }
    }
    if (isRecord(value.A_Expr) || isRecord(value.BooleanTest) || isRecord(value.CaseExpr)) {
      return false
    }
    return Object.values(value).some(collect)
  }
  return values.some(collect)
}

function isEquals(expression: Record<string, unknown>): boolean {
  return (
    Array.isArray(expression.name) &&
    expression.name.some(value => isRecord(value.String) && value.String.sval === '=')
  )
}

function columnReference(value: unknown): { alias: string; column: string } | null {
  if (!isRecord(value) || !isRecord(value.ColumnRef) || !Array.isArray(value.ColumnRef.fields)) {
    return null
  }
  const fields = value.ColumnRef.fields.flatMap(field =>
    isRecord(field.String) && typeof field.String.sval === 'string' ? [field.String.sval] : [],
  )
  if (fields.length !== 2) return null
  return { alias: fields[0], column: fields[1] }
}

function isEligibilityPostId(
  value: { alias: string; column: string } | null,
  aliases: Set<string>,
): boolean {
  return value !== null && value.column === 'post_id' && aliases.has(value.alias)
}

function isPostId(value: { alias: string; column: string } | null, aliases: Set<string>): boolean {
  return value !== null && value.column === 'id' && aliases.has(value.alias)
}
