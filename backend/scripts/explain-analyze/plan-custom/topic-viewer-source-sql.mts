import { initSqlAst, parseSql } from 'vouchington-tooling/sql-ast'

await initSqlAst()
export type TopicViewerSqlNode = NonNullable<
  NonNullable<ReturnType<typeof parseSql>['stmts']>[number]['stmt']
>
export type TopicViewerSelect = Extract<TopicViewerSqlNode, { SelectStmt: unknown }>['SelectStmt']
type TopicViewerCte = Extract<TopicViewerSqlNode, { CommonTableExpr: unknown }>['CommonTableExpr']

/** Read only named canonical input CTEs from the upstream PostgreSQL parser. */
export function topicViewerSourceCte(queryText: string, name: string): TopicViewerCte | undefined {
  try {
    const statements = parseSql(queryText).stmts
    if (statements?.length !== 1) return undefined
    return topicViewerCte(topicViewerSelect(statements[0]?.stmt), name)
  } catch {
    return undefined
  }
}

export function topicViewerCte(
  select: TopicViewerSelect | undefined,
  name: string,
): TopicViewerCte | undefined {
  return select?.withClause?.ctes
    ?.flatMap(node => ('CommonTableExpr' in node ? [node.CommonTableExpr] : []))
    .find(cte => cte?.ctename === name)
}

export function topicViewerSelect(
  node: TopicViewerSqlNode | undefined,
): TopicViewerSelect | undefined {
  return node && 'SelectStmt' in node ? node.SelectStmt : undefined
}

export function topicViewerLateral(
  select: TopicViewerSelect | undefined,
): TopicViewerSelect | undefined {
  const join = select?.fromClause?.[0]
  const lateral = join && 'JoinExpr' in join ? join.JoinExpr.rarg : undefined
  return lateral && 'RangeSubselect' in lateral
    ? topicViewerSelect(lateral.RangeSubselect.subquery)
    : undefined
}
