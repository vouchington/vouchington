// Existing enums retain their original creators; this catalog types their current consumers.
export const EXISTING_FINITE_VALUES_4 = {
  notification_push_intent_statuses: ['pending', 'delivered', 'suppressed'],
  post_types: [
    'discussion',
    'review',
    'data_point',
    'topic_recommendation',
    'comment',
    'story',
    'link',
    'article',
    'blog_post',
  ],
  privacy_types: ['public', 'private'],
  review_dispute_actions: ['no_action', 'remove', 'annotate', 'dismiss'],
  review_dispute_reasons: [
    'factually_inaccurate',
    'defamatory',
    'impersonation',
    'privacy_violation',
    'other',
  ],
} as const
