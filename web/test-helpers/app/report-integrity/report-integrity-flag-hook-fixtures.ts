export const makeFlag = (overrides: Record<string, unknown> = {}) => ({
  id: 'flag-1',
  post_id: null,
  reported_user_id: null,
  hostname_id: null,
  hostname: null,
  rss_feed_item_id: null,
  flag_type: 'mass_report_suspected' as const,
  entity_label: 'Target',
  resolver_username: null,
  resolver_display_name: null,
  reported_username: null,
  reporter_count: 3,
  new_account_reporter_percent: 0.5,
  details: {},
  resolved_at: null,
  resolved_by_id: null,
  resolution: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

export const makeInitialData = (flags: ReturnType<typeof makeFlag>[] = [makeFlag()]) => ({
  results: flags,
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
})
