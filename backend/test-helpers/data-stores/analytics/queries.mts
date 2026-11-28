import { query } from '@data-stores/analytics/query'

export function queryTestAnalyticsAiCallsByKindAndModel(
  kind: string,
  model: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM ai_calls WHERE kind = $1 AND model = $2', [kind, model])
}

export function queryTestAnalyticsAiCallsByKindAndReason(
  kind: string,
  reason: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM ai_calls WHERE kind = $1 AND reason = $2', [kind, reason])
}

export function queryTestAnalyticsApiUsageByUserId(
  userId: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM api_usage WHERE user_id = $1', [userId])
}

export function queryTestAnalyticsAuthSessions(
  deviceId: string,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM auth_sessions WHERE device_id = $1 AND session_id = $2', [
    deviceId,
    sessionId,
  ])
}

export function queryTestAnalyticsCrawlerRequestsByDomain(
  domain: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM crawler_requests WHERE domain = $1', [domain])
}

export function queryTestAnalyticsCrawlerRequestsByDomainAndType<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(domain: string, crawlerType: string): Promise<Row[]> {
  return query<Row>('SELECT * FROM crawler_requests WHERE domain = $1 AND crawler_type = $2', [
    domain,
    crawlerType,
  ])
}

export function queryTestAnalyticsCrawlerRequestsByDomainTypeAndStatus(
  domain: string,
  crawlerType: string,
  statusCode: number,
): Promise<Record<string, unknown>[]> {
  return query(
    'SELECT * FROM crawler_requests WHERE domain = $1 AND crawler_type = $2 AND status_code = $3',
    [domain, crawlerType, statusCode],
  )
}

export function queryTestAnalyticsCrawlerRequestsByDomainAndEventType(
  domain: string,
  eventType: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM crawler_requests WHERE domain = $1 AND event_type = $2', [
    domain,
    eventType,
  ])
}

export function queryTestAnalyticsVoteDrift(
  entityTable: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM pg_vote_drift WHERE entity_table = $1', [entityTable])
}

export function queryTestAnalyticsMcpToolCallsByRequestEventId(
  requestEventId: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM mcp_tool_call WHERE request_event_id = $1', [requestEventId])
}

export function queryTestAnalyticsMcpToolCallsByUserId(
  userId: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM mcp_tool_call WHERE user_id = $1', [userId])
}

export function queryTestAnalyticsWebClicks(
  pageKind: string,
  targetId: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM web_click WHERE page_kind = $1 AND target_id = $2', [
    pageKind,
    targetId,
  ])
}

export function queryTestAnalyticsWebPageViewsByKindAndPage(
  pageKind: string,
  pageId: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM web_page_view WHERE page_kind = $1 AND page_id = $2', [
    pageKind,
    pageId,
  ])
}

export function queryTestAnalyticsWebPageViewsByKindPageAndSession(
  pageKind: string,
  pageId: string,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  return query(
    'SELECT * FROM web_page_view WHERE page_kind = $1 AND page_id = $2 AND session_id = $3',
    [pageKind, pageId, sessionId],
  )
}

export function queryTestAnalyticsPgQueryTimingByAnnotation(
  annotation: string,
): Promise<Record<string, unknown>[]> {
  return query('SELECT * FROM pg_query_timing WHERE annotation = $1', [annotation])
}

export function queryTestAnalyticsPgQueryTimingByAnnotationRowCountAndPool(
  annotation: string,
  rowCount: number,
  pool: string,
): Promise<Record<string, unknown>[]> {
  return query(
    'SELECT * FROM pg_query_timing WHERE annotation = $1 AND row_count = $2 AND pool = $3',
    [annotation, rowCount, pool],
  )
}
