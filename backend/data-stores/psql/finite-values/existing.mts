import type { MODERATION_CLEANUP_KINDS } from '@voucha/types/entities/moderation-retention'

// Existing enums retain their original creators; these types describe their current consumers.
export type ExistingFiniteValues = {
  readonly classifier_candidate_kinds: readonly ['topic', 'story', 'community_prompt']
  readonly classifier_model_providers: readonly ['typesafe', 'openrouter', 'openai']
  readonly classifier_primitives: readonly ['noul', 'choice', 'score', 'agent']
  readonly community_automod_actions: readonly ['record_only', 'review_queue', 'unpublish']
  readonly import_entity_types: readonly ['topic', 'rss_feed']
  readonly list_visibilities: readonly ['private', 'unlisted', 'public']
  readonly moderation_appeal_actions: readonly ['accept', 'deny', 'reduce']
  readonly moderation_judgement_actions: readonly ['no_action', 'warn', 'remove', 'escalate']
  readonly moderation_report_entity_types: readonly [
    'rss_feed_item',
    'post',
    'comment',
    'user',
    'url_hostname',
  ]
  readonly moderation_report_reasons: readonly [
    'spam',
    'harassment',
    'misinformation',
    'illegal_content',
    'other',
    'vote_manipulation',
  ]
  readonly moderation_report_resolution_actions: readonly ['reviewed', 'actioned', 'dismissed']
  readonly moderation_training_event_types: readonly [
    'automod_reviewed',
    'manual_action_inferred',
    'report_resolved',
    'dispute_resolved',
    'appeal_resolved',
    'draft_edited',
    'agent_accuracy_voted',
    'prompt_test_labelled',
  ]
  readonly moderation_training_labels: readonly [
    'true_positive',
    'false_positive',
    'false_negative_candidate',
    'true_negative',
    'accepted',
    'edited',
    'rejected',
    'not_applicable',
  ]
  readonly moderation_training_source_types: readonly [
    'agent_moderation',
    'openai_omni',
    'spam_detection',
    'community_prompt',
    'community_review',
    'moderation_report',
    'moderation_appeal',
    'review_dispute',
    'agent_moderation_vote',
    'prompt_test_run',
  ]
  readonly notification_push_endpoint_statuses: readonly [
    'pending',
    'delivered',
    'permanently_failed',
  ]
  readonly notification_push_intent_statuses: readonly ['pending', 'delivered', 'suppressed']
  readonly post_types: readonly [
    'discussion',
    'review',
    'data_point',
    'topic_recommendation',
    'comment',
    'story',
    'link',
    'article',
    'blog_post',
  ]
  readonly privacy_types: readonly ['public', 'private']
  readonly review_dispute_actions: readonly ['no_action', 'remove', 'annotate', 'dismiss']
  readonly review_dispute_reasons: readonly [
    'factually_inaccurate',
    'defamatory',
    'impersonation',
    'privacy_violation',
    'other',
  ]
  readonly moderation_record_cleanup_kinds: typeof MODERATION_CLEANUP_KINDS
  readonly retained_identity_families: readonly [
    'user',
    'api_key',
    'topic',
    'post',
    'rss_feed_item',
    'membership',
  ]
  readonly retained_identity_cleanup_families: readonly [
    'user',
    'api_key',
    'topic',
    'post',
    'rss_feed_item',
    'image',
    'membership',
    'community_bridge',
    'remote_actor',
    'copyright_notice',
  ]
  readonly revision_types: readonly ['create', 'update', 'delete']
  readonly user_display_name_sources: readonly [
    'username',
    'facebook',
    'x',
    'apple',
    'google',
    'linkedin',
    'microsoft',
    'github',
  ]
}
