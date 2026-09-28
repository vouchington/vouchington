import { electedRelationMetadata } from '@services/users/relation-impact-targets'

function retainedRelationReferences(subjectType: string): [string, string][] {
  return electedRelationMetadata.flatMap(metadata =>
    metadata.subject_type === subjectType
      ? [[`retained_${metadata.table_name}`, 'subject_id']]
      : [],
  )
}

export const ROOT_FAMILIES = {
  user: {
    table: 'retained_user_identities',
    references: [
      ['users', 'id'],
      ['user_deletion_requests', 'user_id'],
      ['user_deletion_requests', 'requested_by_id'],
      ['user_deletion_audit_logs', 'user_id'],
      ['user_deletion_audit_logs', 'requested_by_id'],
      ['post_publication_author_identities', 'id'],
      ['post_clearance_changes', 'changed_by_id'],
      ['post_moderation_dispositions', 'actor_user_id'],
      ['moderation_appeal_lifecycle_changes', 'original_decision_actor_id'],
      ['moderation_training_feedbacks', 'metadata_report_user_id'],
      ...retainedRelationReferences('user'),
    ],
  },
  topic: {
    table: 'retained_topic_identities',
    references: [
      ['topics', 'id'],
      ['post_revision_rating_topics', 'topic_id'],
      ['post_revision_categories', 'topic_id'],
      ['post_revision_data_point_topics', 'topic_id'],
      ['topic_revisions', 'rewards_program_id_before'],
      ['topic_revisions', 'rewards_program_id_after'],
      ['topic_revisions', 'referral_program_id_before'],
      ['topic_revisions', 'referral_program_id_after'],
      ...retainedRelationReferences('topic'),
    ],
  },
  post: {
    table: 'retained_post_identities',
    references: [
      ['posts', 'id'],
      ['post_publication_post_identities', 'id'],
      ['post_admission_reservations', 'committed_post_id'],
      ['moderation_training_feedbacks', 'metadata_report_post_id'],
      ...retainedRelationReferences('post'),
    ],
  },
  rss_feed_item: {
    table: 'retained_rss_feed_item_identities',
    references: [
      ['rss_feed_items', 'id'],
      ['post_publication_rss_feed_item_identities', 'id'],
      ['moderation_training_feedbacks', 'metadata_report_rss_feed_item_id'],
      ...retainedRelationReferences('rss_feed_item'),
    ],
  },
  image: {
    table: 'retained_image_identities',
    references: [
      ['images', 'id'],
      ['retained_image_placement_bindings', 'image_id'],
      ['post_revision_images', 'image_id'],
      ['topic_revisions', 'logo_image_id_before'],
      ['topic_revisions', 'logo_image_id_after'],
      ['topic_revisions', 'hero_image_id_before'],
      ['topic_revisions', 'hero_image_id_after'],
      ['moderator_actions', 'metadata_image_id'],
    ],
  },
  url_hostname: {
    table: 'retained_url_hostname_identities',
    references: [
      ['url_hostnames', 'id'],
      ['topic_revisions', 'hostname_id_before'],
      ['topic_revisions', 'hostname_id_after'],
      ['moderation_training_feedbacks', 'metadata_report_hostname_id'],
    ],
  },
  url: {
    table: 'retained_url_identities',
    references: [
      ['urls', 'id'],
      ['topic_revisions', 'homepage_url_id_before'],
      ['topic_revisions', 'homepage_url_id_after'],
    ],
  },
  topic_alias: {
    table: 'retained_topic_alias_identities',
    references: [
      ['topic_aliases', 'id'],
      ['topic_revision_alias_entries', 'alias_id'],
    ],
  },
  community: {
    table: 'retained_community_identities',
    references: [
      ['communities', 'id'],
      ['post_clearance_changes', 'moderation_transparency_community_id'],
      ['moderator_actions', 'moderation_transparency_community_id'],
    ],
  },
  community_agent_prompt: {
    table: 'retained_community_agent_prompt_identities',
    references: [
      ['community_agent_prompts', 'id'],
      ['community_agent_prompt_changes', 'agent_prompt_id'],
      ['moderation_training_feedbacks', 'metadata_prompt_id'],
    ],
  },
  community_restriction: {
    table: 'retained_community_restriction_identities',
    references: [
      ['community_restrictions', 'id'],
      ['moderator_action_restrictions', 'restriction_id'],
    ],
  },
  post_admission_reservation: {
    table: 'retained_post_admission_reservation_identities',
    references: [
      ['post_admission_reservations', 'id'],
      ['post_admission_quota_consumptions', 'reservation_id'],
    ],
  },
} as const
