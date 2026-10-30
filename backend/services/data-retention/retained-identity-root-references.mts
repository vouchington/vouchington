import {
  retainedRelationReferences,
  RETAINED_USER_REFERENCES,
} from './retained-user-references.mts'
import { COMMUNITY_BRIDGE_FAMILY } from './retained-community-bridge-family.mts'
export const ROOT_FAMILIES = {
  community_bridge: COMMUNITY_BRIDGE_FAMILY,
  user: {
    table: 'retained_user_identities',
    references: RETAINED_USER_REFERENCES,
  },
  remote_actor: {
    table: 'remote_actor_identities',
    references: [
      ['remote_actors', 'id'],
      ['activitypub_remote_follow_activities', 'remote_actor_identity_id'],
      ['activitypub_post_like_activities', 'remote_actor_identity_id'],
    ],
  },
  membership: {
    table: 'retained_membership_identities',
    references: [
      ['memberships', 'id'],
      ['membership_changes', 'membership_id'],
      ['membership_refunds', 'membership_id'],
      ['membership_administrator_refund_operation_requests', 'membership_id'],
      ['membership_operation_retained_identities', 'administrator_membership_id'],
    ],
  },
  api_key: {
    table: 'retained_api_key_identities',
    references: [
      ['api_keys', 'id'],
      ['mcp_call_audit_events', 'api_key_id'],
    ],
  },
  topic: {
    table: 'retained_topic_identities',
    references: [
      ['topics', 'id'],
      ['review_succession_topics', 'topic_id'],
      ...retainedRelationReferences('topic'),
    ],
  },
  post: {
    table: 'retained_post_identities',
    references: [
      ['posts', 'id'],
      ['activitypub_post_like_activities', 'post_id'],
      ['notifications', 'publication_post_id'],
      ['post_admission_reservations', 'committed_post_id'],
      ['image_deletion_post_updates', 'post_id'],
      ['classifier_run_identities', 'post_id'],
      ['classifier_run_requests', 'post_id'],
      ...retainedRelationReferences('post'),
    ],
  },
  rss_feed_item: {
    table: 'retained_rss_feed_item_identities',
    references: [
      ['rss_feed_items', 'id'],
      ['notifications', 'publication_rss_feed_item_id'],
      ['classifier_run_identities', 'rss_feed_item_id'],
      ['classifier_run_requests', 'rss_feed_item_id'],
      ...retainedRelationReferences('rss_feed_item'),
    ],
  },
  image: {
    table: 'retained_image_identities',
    references: [
      ['images', 'id'],
      ['retained_image_placement_bindings', 'image_id'],
      ['copyright_notice_target_images', 'image_id'],
      ['copyright_staydown_entries', 'image_id'],
      ['copyright_staydown_matches', 'image_id'],
    ],
  },
} as const
