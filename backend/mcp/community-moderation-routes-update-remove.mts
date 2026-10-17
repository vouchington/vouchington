/** Approved update-remove community moderator REST routes for issue #2546. */
export const communityModerationUpdateRemoveRoutes = [
  { method: 'PATCH', path: '/api/v1/communities/:idOrSlug', option: 'update_community_settings' },
  {
    method: 'PATCH',
    path: '/api/v1/communities/:idOrSlug/applications/:id',
    option: 'review_application',
  },
  {
    method: 'PATCH',
    path: '/api/v1/communities/:idOrSlug/moderator-vacation',
    option: 'set_vacation_digest_preference',
  },
  {
    method: 'PATCH',
    path: '/api/v1/communities/:idOrSlug/modmail/:conversationId',
    option: 'update_modmail_thread',
  },
  {
    method: 'PATCH',
    path: '/api/v1/communities/:idOrSlug/post-type-settings',
    option: 'update_post_type_settings',
  },
  { method: 'PATCH', path: '/api/v1/communities/:idOrSlug/posts/:postId', option: 'moderate_post' },
  {
    method: 'PATCH',
    path: '/api/v1/communities/:idOrSlug/reports/:reportId',
    option: 'resolve_report',
  },
  {
    method: 'PUT',
    path: '/api/v1/communities/:idOrSlug/application-questions',
    option: 'set_application_questions',
  },
  {
    method: 'PUT',
    path: '/api/v1/communities/:idOrSlug/moderator-vacation',
    option: 'set_moderator_vacation',
  },
  { method: 'PUT', path: '/api/v1/communities/:idOrSlug/pinned-posts', option: 'set_pinned_posts' },
  {
    method: 'PUT',
    path: '/api/v1/communities/:idOrSlug/posts/:postId/claim',
    option: 'claim_post',
  },
  {
    method: 'PUT',
    path: '/api/v1/communities/:idOrSlug/reports/:reportId/claim',
    option: 'claim_report',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/ban-evasion/:userId',
    option: 'dismiss_ban_evasion',
  },
  { method: 'DELETE', path: '/api/v1/communities/:idOrSlug/bans/:userId', option: 'lift_ban' },
  { method: 'DELETE', path: '/api/v1/communities/:idOrSlug/invites/:id', option: 'revoke_invite' },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/list-items/domains/:itemId',
    option: 'remove_domain_from_list',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/list-items/posts/:itemId',
    option: 'remove_post_from_list',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/list-items/rss-feeds/:itemId',
    option: 'remove_rss_feed_from_list',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/list-items/topics/:itemId',
    option: 'remove_topic_from_list',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/list-items/urls/:itemId',
    option: 'remove_url_from_list',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/members/:userId',
    option: 'remove_member',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/moderator-vacation',
    option: 'clear_moderator_vacation',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/posts/:postId/claim',
    option: 'release_post_claim',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/posts/:postId/escalation',
    option: 'deescalate_post',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/reports/:reportId/claim',
    option: 'release_report_claim',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/reports/:reportId/escalation',
    option: 'deescalate_report',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/restrictions/:id',
    option: 'lift_restriction',
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/:idOrSlug/saved-replies/:id',
    option: 'delete_saved_reply',
  },
] as const
