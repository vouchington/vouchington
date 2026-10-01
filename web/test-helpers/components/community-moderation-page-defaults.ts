const emptyPageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

export const defaultPendingPosts = {
  results: [],
  page_info: emptyPageInfo,
  posts: {},
  posts_metrics: {},
}
export const defaultAutomodActions = {
  automod_actions: [],
  stats: { total_count: 0, false_positive_count: 0, false_positive_rate: 0 },
  page_info: emptyPageInfo,
}
export const defaultAutomodFlags = {
  entries: [],
  page_info: emptyPageInfo,
  viewer_tier: 'moderator',
}
export const defaultModeratorStats = { window: 30, stats: [], users: {} }
export const defaultRestrictions = {
  results: [],
  page_info: emptyPageInfo,
  community_restrictions: {},
  raid_mode_suggestion: { velocity_spike: false, flag_count: 0, latest_flagged_at: null },
}
