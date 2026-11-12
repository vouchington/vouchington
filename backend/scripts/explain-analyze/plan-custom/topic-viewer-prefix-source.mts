import {
  topicViewerSourceCte,
  topicViewerSelect,
  type TopicViewerSqlNode,
} from './topic-viewer-source-sql.mts'

/** Bind an EXPLAIN tuple range to the exact canonical source CTE parameters. */
export function topicViewerPrefixSourceBounds(
  queryText: string,
  input: { cte: string; relation: string },
): string[] | undefined {
  const cte = topicViewerSourceCte(queryText, input.cte)
  const select = topicViewerSelect(cte?.ctequery)
  if (cte?.ctematerialized !== 'CTEMaterializeAlways' || !select) return undefined
  if (
    select.fromClause?.length !== 1 ||
    !('RangeVar' in select.fromClause[0]!) ||
    select.fromClause[0].RangeVar.relname !== input.relation
  )
    return undefined
  if (
    select.targetList?.length !== 1 ||
    column(
      select.targetList[0] && 'ResTarget' in select.targetList[0]
        ? select.targetList[0].ResTarget.val
        : undefined,
    ) !== 'post_id'
  )
    return undefined
  if (
    select.sortClause?.length !== 2 ||
    select.sortClause
      .map(node => column('SortBy' in node ? node.SortBy.node : undefined))
      .join(',') !== 'topic_id,post_id'
  )
    return undefined
  if (!select.limitCount || !('ParamRef' in select.limitCount)) return undefined
  const where =
    select.whereClause && 'BoolExpr' in select.whereClause ? select.whereClause.BoolExpr : undefined
  if (where?.boolop !== 'AND_EXPR' || where.args?.length !== 2) return undefined
  const lower = bound(where.args[0], '>=')
  const upper = bound(where.args[1], '<=')
  return lower && upper ? [...lower, ...upper] : undefined
}

function column(node: TopicViewerSqlNode | undefined): string | undefined {
  const fields = node && 'ColumnRef' in node ? node.ColumnRef.fields : undefined
  if (fields?.length !== 1) return undefined
  const first = fields[0]
  return first && 'String' in first ? first.String.sval : undefined
}

function bound(node: TopicViewerSqlNode | undefined, operator: string): string[] | undefined {
  const expr = node && 'A_Expr' in node ? node.A_Expr : undefined
  if (
    expr?.kind !== 'AEXPR_OP' ||
    expr.name?.length !== 1 ||
    !expr.name[0] ||
    !('String' in expr.name[0]) ||
    expr.name[0].String.sval !== operator
  )
    return undefined
  const keys = expr.lexpr && 'RowExpr' in expr.lexpr ? expr.lexpr.RowExpr.args : undefined
  const values = expr.rexpr && 'RowExpr' in expr.rexpr ? expr.rexpr.RowExpr.args : undefined
  if (
    keys?.length !== 2 ||
    keys.map(column).join(',') !== 'topic_id,post_id' ||
    values?.length !== 2
  )
    return undefined
  const params: string[] = []
  for (const value of values) {
    if (!('TypeCast' in value)) return undefined
    const cast = value.TypeCast
    const names = cast.typeName?.names
    if (
      names?.length !== 1 ||
      !names[0] ||
      !('String' in names[0]) ||
      names[0].String.sval !== 'uuid' ||
      !cast.arg ||
      !('ParamRef' in cast.arg)
    )
      return undefined
    params.push(`$${cast.arg.ParamRef.number}`)
  }
  return params
}
