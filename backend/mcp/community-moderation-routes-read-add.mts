/** Approved read-add community moderator REST routes for issue #2546. */
export const communityModerationReadAddRoutes = [
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/applications',
    option: 'list_applications',
  },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/automod/recent-actions',
    option: 'list_automod_actions',
  },
  { method: 'GET', path: '/api/v1/communities/:idOrSlug/bans', option: 'list_bans' },
  { method: 'GET', path: '/api/v1/communities/:idOrSlug/invites', option: 'list_invites' },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/moderation-analytics',
    option: 'read_moderation_analytics',
  },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/moderator-stats',
    option: 'read_moderator_stats',
  },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/moderator-vacation',
    option: 'read_moderator_vacation',
  },
  { method: 'GET', path: '/api/v1/communities/:idOrSlug/modlog', option: 'read_modlog' },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/posts/pending',
    option: 'list_pending_posts',
  },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/reports/pending',
    option: 'list_pending_reports',
  },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/restrictions',
    option: 'list_restrictions',
  },
  {
    method: 'GET',
    path: '/api/v1/communities/:idOrSlug/saved-replies',
    option: 'list_saved_replies',
  },
  { method: 'POST', path: '/api/v1/communities/:idOrSlug/bans', option: 'ban_user' },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/list-items/domains',
    option: 'add_domain_to_list',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/list-items/posts',
    option: 'add_post_to_list',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/list-items/rss-feeds',
    option: 'add_rss_feed_to_list',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/list-items/topics',
    option: 'add_topic_to_list',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/list-items/urls',
    option: 'add_url_to_list',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal',
    option: 'dismiss_automod_flag',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/posts/:postId/escalation',
    option: 'escalate_post',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/posts/:postId/mod-internal-thread',
    option: 'open_post_mod_internal_thread',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/reports/:reportId/escalation',
    option: 'escalate_report',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/reports/:reportId/mod-internal-thread',
    option: 'open_report_mod_internal_thread',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/restrictions',
    option: 'activate_restrictions',
  },
  {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/saved-replies',
    option: 'create_saved_reply',
  },
  { method: 'POST', path: '/api/v1/communities/:idOrSlug/warnings', option: 'issue_warning' },
] as const
