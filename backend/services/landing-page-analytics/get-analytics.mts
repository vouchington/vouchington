import { read } from '@data-stores/psql'
import { query } from '@data-stores/analytics'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import type {
  LandingPageAnalytics,
  LandingPageItemClickStats,
  DailyStats,
  UtmSourceStats,
} from './types.mts'

export async function getLandingPageAnalytics(
  currentUserId: string,
  landingPageId: string,
): Promise<Omit<LandingPageAnalytics, 'conversion_funnel'>> {
  assert(isUUID(landingPageId), 422, 'Invalid landing page ID')

  const { rows: ownerRows } = await read(sql`/* getLandingPageAnalytics:ownership */
    SELECT id FROM user_landing_pages
    WHERE id = ${landingPageId} AND user_id = ${currentUserId}
    LIMIT 1
  `)
  assert(ownerRows.length > 0, 404, 'Landing page not found')

  return getLandingPageAnalyticsByPageId(landingPageId)
}

export async function getLandingPageAnalyticsByPageId(
  landingPageId: string,
): Promise<Omit<LandingPageAnalytics, 'conversion_funnel'>> {
  assert(isUUID(landingPageId), 422, 'Invalid landing page ID')

  const pageId = landingPageId

  const [visitRows, clickRows, itemClickRows, dailyRows, utmRows] = await Promise.all([
    // Total visits and unique visitors (last 30 days for unique_visitors)
    query<{ total_visits: number; unique_visitors: number }>(
      `
      SELECT
        COUNT(*) AS total_visits,
        COUNT(DISTINCT session_id) FILTER (WHERE event_date >= current_date - INTERVAL '30 days') AS unique_visitors
      FROM web_page_view
      WHERE page_kind = 'landing_page'
        AND page_id = $1
    `,
      [pageId],
    ),
    // Total clicks
    query<{ total_clicks: number }>(
      `
      SELECT COUNT(*) AS total_clicks
      FROM web_click
      WHERE page_kind = 'landing_page'
        AND page_id = $1
    `,
      [pageId],
    ),
    // Per-item click counts
    query<{ item_id: string; click_count: number }>(
      `
      SELECT
        target_id AS item_id,
        COUNT(*) AS click_count
      FROM web_click
      WHERE page_kind = 'landing_page'
        AND page_id = $1
        AND target_kind = 'item'
        AND target_id IS NOT NULL
      GROUP BY target_id
      ORDER BY click_count DESC
    `,
      [pageId],
    ),
    // Daily combined visits and clicks (last 30 days)
    query<{ date: string; visits: number; clicks: number; unique_visitors: number }>(
      `
      WITH daily_visits AS (
        SELECT
          event_date AS date,
          COUNT(*) AS visits,
          COUNT(DISTINCT session_id) AS unique_visitors
        FROM web_page_view
        WHERE page_kind = 'landing_page'
          AND page_id = $1
          AND event_date >= current_date - INTERVAL '30 days'
        GROUP BY event_date
      ),
      daily_clicks AS (
        SELECT event_date AS date, COUNT(*) AS clicks
        FROM web_click
        WHERE page_kind = 'landing_page'
          AND page_id = $1
          AND event_date >= current_date - INTERVAL '30 days'
        GROUP BY event_date
      )
      SELECT
        COALESCE(v.date, c.date) AS date,
        COALESCE(v.visits, 0) AS visits,
        COALESCE(c.clicks, 0) AS clicks,
        COALESCE(v.unique_visitors, 0) AS unique_visitors
      FROM daily_visits v
      FULL OUTER JOIN daily_clicks c ON v.date = c.date
      ORDER BY date ASC
    `,
      [pageId],
    ),
    // UTM source breakdown (last 30 days)
    query<{ utm_source: string; visits: number }>(
      `
      SELECT
        COALESCE(NULLIF(utm_source, ''), 'direct') AS utm_source,
        COUNT(*) AS visits
      FROM web_page_view
      WHERE page_kind = 'landing_page'
        AND page_id = $1
        AND event_date >= current_date - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 20
    `,
      [pageId],
    ),
  ])

  const totalVisits = Number(visitRows[0]?.total_visits ?? 0)
  const uniqueVisitors = Number(visitRows[0]?.unique_visitors ?? 0)
  const totalClicks = Number(clickRows[0]?.total_clicks ?? 0)

  // Enrich item clicks with item_type from PG
  const itemIds = itemClickRows.map(r => r.item_id)
  let itemClicks: LandingPageItemClickStats[] = []
  if (itemIds.length > 0) {
    const { rows: itemRows } = await read(sql`/* getLandingPageAnalytics:itemTypes */
      SELECT id, item_type
      FROM user_landing_page_items
      WHERE id = ANY(${itemIds}::uuid[])
    `)
    const itemTypeMap = new Map(
      (itemRows as Array<{ id: string; item_type: string }>).map(r => [r.id, r.item_type]),
    )
    itemClicks = itemClickRows.map(r => ({
      item_id: r.item_id,
      item_type: itemTypeMap.get(r.item_id) ?? 'unknown',
      click_count: Number(r.click_count),
    }))
  }

  const dailyStats: DailyStats[] = dailyRows.map(r => ({
    date: r.date,
    visits: Number(r.visits),
    clicks: Number(r.clicks),
    unique_visitors: Number(r.unique_visitors),
  }))

  const utmSources: UtmSourceStats[] = utmRows.map(r => ({
    utm_source: r.utm_source,
    visits: Number(r.visits),
  }))

  return {
    total_visits: totalVisits,
    total_clicks: totalClicks,
    ctr: totalVisits > 0 ? totalClicks / totalVisits : 0,
    unique_visitors: uniqueVisitors,
    item_clicks: itemClicks,
    daily_stats: dailyStats,
    utm_sources: utmSources,
  }
}
