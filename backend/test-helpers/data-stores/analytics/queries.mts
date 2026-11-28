import { query } from '@data-stores/analytics/query'

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function queryTestAnalyticsAiCalls(filter: {
  kind: string
  model?: string
  reason?: string
}): Promise<Record<string, unknown>[]> {
  const clauses = [`kind = ${sqlLiteral(filter.kind)}`]
  if (filter.model !== undefined) clauses.push(`model = ${sqlLiteral(filter.model)}`)
  if (filter.reason !== undefined) clauses.push(`reason = ${sqlLiteral(filter.reason)}`)
  return query(`SELECT * FROM ai_calls WHERE ${clauses.join(' AND ')}`)
}

export function queryTestAnalyticsApiUsageByUserId(
  userId: string,
): Promise<Record<string, unknown>[]> {
  return query(`SELECT * FROM api_usage WHERE user_id = ${sqlLiteral(userId)}`)
}

export function queryTestAnalyticsAuthSessions(
  deviceId: string,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT * FROM auth_sessions WHERE device_id = ${sqlLiteral(deviceId)} AND session_id = ${sqlLiteral(sessionId)}`,
  )
}

export function queryTestAnalyticsCrawlerRequests<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(filter: {
  domain: string
  crawlerType?: string
  statusCode?: number
  eventType?: string
}): Promise<Row[]> {
  const clauses = [`domain = ${sqlLiteral(filter.domain)}`]
  if (filter.crawlerType !== undefined)
    clauses.push(`crawler_type = ${sqlLiteral(filter.crawlerType)}`)
  if (filter.statusCode !== undefined) clauses.push(`status_code = ${filter.statusCode}`)
  if (filter.eventType !== undefined) clauses.push(`event_type = ${sqlLiteral(filter.eventType)}`)
  return query<Row>(`SELECT * FROM crawler_requests WHERE ${clauses.join(' AND ')}`)
}

export function queryTestAnalyticsVoteDrift(
  entityTable: string,
): Promise<Record<string, unknown>[]> {
  return query(`SELECT * FROM pg_vote_drift WHERE entity_table = ${sqlLiteral(entityTable)}`)
}

export function queryTestAnalyticsMcpToolCallsByRequestEventId(
  requestEventId: string,
): Promise<Record<string, unknown>[]> {
  return query(`SELECT * FROM mcp_tool_call WHERE request_event_id = ${sqlLiteral(requestEventId)}`)
}

export function queryTestAnalyticsMcpToolCallsByUserId(
  userId: string,
): Promise<Record<string, unknown>[]> {
  return query(`SELECT * FROM mcp_tool_call WHERE user_id = ${sqlLiteral(userId)}`)
}

export function queryTestAnalyticsWebClicks(
  pageKind: string,
  targetId: string,
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT * FROM web_click WHERE page_kind = ${sqlLiteral(pageKind)} AND target_id = ${sqlLiteral(targetId)}`,
  )
}

export function queryTestAnalyticsWebPageViews(filter: {
  pageKind: string
  pageId: string
  sessionId?: string
}): Promise<Record<string, unknown>[]> {
  const clauses = [
    `page_kind = ${sqlLiteral(filter.pageKind)}`,
    `page_id = ${sqlLiteral(filter.pageId)}`,
  ]
  if (filter.sessionId !== undefined) clauses.push(`session_id = ${sqlLiteral(filter.sessionId)}`)
  return query(`SELECT * FROM web_page_view WHERE ${clauses.join(' AND ')}`)
}

export function queryTestAnalyticsPgQueryTiming(filter: {
  annotation: string
  rowCount?: number
  pool?: string
}): Promise<Record<string, unknown>[]> {
  const clauses = [`annotation = ${sqlLiteral(filter.annotation)}`]
  if (filter.rowCount !== undefined) clauses.push(`row_count = ${filter.rowCount}`)
  if (filter.pool !== undefined) clauses.push(`pool = ${sqlLiteral(filter.pool)}`)
  return query(`SELECT * FROM pg_query_timing WHERE ${clauses.join(' AND ')}`)
}
