// Existing enums retain their original creators; this catalog types their current consumers.
export const EXISTING_FINITE_VALUES_1 = {
  classifier_candidate_kinds: ['topic', 'story', 'community_prompt'],
  classifier_model_providers: ['typesafe', 'openrouter'],
  classifier_primitives: ['noul', 'choice', 'score'],
  community_automod_actions: ['record_only', 'review_queue', 'unpublish'],
  import_entity_types: ['topic', 'rss_feed'],
} as const
