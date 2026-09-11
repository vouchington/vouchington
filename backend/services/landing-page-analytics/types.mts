export type DailyStats = {
  date: string // ISO date string YYYY-MM-DD
  visits: number
  clicks: number
  unique_visitors: number
}

export type LandingPageItemClickStats = {
  item_id: string
  item_type: string
  click_count: number
}

export type UtmSourceStats = {
  utm_source: string // "direct" for null/empty
  visits: number
}

export type ConversionFunnel = {
  total_visits: number
  total_clicks: number
  total_signups: number
  visit_to_click_rate: number // 0-1
  // visit_to_signup_rate intentionally omitted: signups are user-scoped (not per landing page),
  // so dividing by per-page visits produces a misleading cross-scope rate.
}

export type LandingPageAnalytics = {
  total_visits: number
  total_clicks: number
  ctr: number // click-through rate 0-1
  unique_visitors: number
  item_clicks: LandingPageItemClickStats[]
  daily_stats: DailyStats[]
  utm_sources: UtmSourceStats[]
  conversion_funnel: ConversionFunnel
}
