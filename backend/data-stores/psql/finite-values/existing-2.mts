// Existing enums retain their original creators; this catalog types their current consumers.
export const EXISTING_FINITE_VALUES_2 = {
  list_visibilities: ['private', 'unlisted', 'public'],
  moderation_appeal_actions: ['accept', 'deny', 'reduce'],
  moderation_judgement_actions: ['no_action', 'warn', 'remove', 'escalate'],
  moderation_report_entity_types: ['rss_feed_item', 'post', 'comment', 'user', 'url_hostname'],
  moderation_report_reasons: [
    'spam',
    'harassment',
    'misinformation',
    'illegal_content',
    'other',
    'vote_manipulation',
  ],
} as const
