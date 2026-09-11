# Functions

[Schema index](README.md).

## `fn_ap_inbox_delivery_retention`

```sql
CREATE OR REPLACE FUNCTION public.fn_ap_inbox_delivery_retention()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_ap_inbox_delivery_storage_after_delete`

```sql
CREATE OR REPLACE FUNCTION public.fn_ap_inbox_delivery_storage_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_ap_inbox_delivery_storage_after_insert`

```sql
CREATE OR REPLACE FUNCTION public.fn_ap_inbox_delivery_storage_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_ap_inbox_delivery_storage_after_update`

```sql
CREATE OR REPLACE FUNCTION public.fn_ap_inbox_delivery_storage_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_apply_moderation_transparency_daily_rollup(p_occurred_at timestamp with time zone, p_community_id uuid, p_metric text, p_category text, p_delta integer)`

```sql
CREATE OR REPLACE FUNCTION public.fn_apply_moderation_transparency_daily_rollup(p_occurred_at timestamp with time zone, p_community_id uuid, p_metric text, p_category text, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_assert_web_push_endpoint_owner_subscription`

```sql
CREATE OR REPLACE FUNCTION public.fn_assert_web_push_endpoint_owner_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_assert_web_push_subscription_owner`

```sql
CREATE OR REPLACE FUNCTION public.fn_assert_web_push_subscription_owner()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_capture_notification_push_intent`

```sql
CREATE OR REPLACE FUNCTION public.fn_capture_notification_push_intent()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_topic_metrics_on_insert`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_topic_metrics_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_user_individual_household`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_user_individual_household()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_user_metrics_on_insert`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_user_metrics_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_deduplicate_user_import_topic_recommendation`

```sql
CREATE OR REPLACE FUNCTION public.fn_deduplicate_user_import_topic_recommendation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_enforce_membership_provider_evidence_immutability`

```sql
CREATE OR REPLACE FUNCTION public.fn_enforce_membership_provider_evidence_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_fence_bluesky_follow_receipt_active_users`

```sql
CREATE OR REPLACE FUNCTION public.fn_fence_bluesky_follow_receipt_active_users()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_admin_import_batch_type`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_admin_import_batch_type()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_membership_grant_activation_period_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_membership_grant_activation_period_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_membership_grant_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_membership_grant_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_membership_lineage_binding_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_membership_lineage_binding_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_membership_operation_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_membership_operation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_membership_refund_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_membership_refund_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_review_dispute_subject_snapshot`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_review_dispute_subject_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_review_succession_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_review_succession_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_terminal_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_terminal_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_immutable_array_to_string(p_array text[], p_delimiter text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_immutable_array_to_string(p_array text[], p_delimiter text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
```

## `fn_lock_active_user_for_mutation(target_user_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_active_user_for_mutation(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_lock_agent_moderation_transparency_agent`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_agent_moderation_transparency_agent()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_lock_agent_moderation_transparency_community_prompt`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_agent_moderation_transparency_community_prompt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_lock_agent_moderation_transparency_prompt`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_agent_moderation_transparency_prompt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_lock_moderation_transparency_projection(p_domain text, p_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_moderation_transparency_projection(p_domain text, p_id uuid)
 RETURNS void
 LANGUAGE sql
```

## `fn_mark_topic_alias_category_mapping_dirty`

```sql
CREATE OR REPLACE FUNCTION public.fn_mark_topic_alias_category_mapping_dirty()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_actions_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_actions_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_actions_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_actions_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_agent_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_agent_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_agent_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_agent_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_agent_update_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_agent_update_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_appeals_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_appeals_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_appeals_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_appeals_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_appeals_update_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_appeals_update_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_clearance_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_clearance_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_clearance_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_clearance_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_reports_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_reports_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_moderation_transparency_reports_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_moderation_transparency_reports_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_preserve_notification_publication_target`

```sql
CREATE OR REPLACE FUNCTION public.fn_preserve_notification_publication_target()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_prevent_post_creation_source_url_update`

```sql
CREATE OR REPLACE FUNCTION public.fn_prevent_post_creation_source_url_update()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_agent_moderation_transparency_projection`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_agent_moderation_transparency_projection()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_clearance_transparency_categories`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_clearance_transparency_categories()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_moderation_appeal_resolution`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_moderation_appeal_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_moderation_report_original_reason`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_moderation_report_original_reason()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_moderation_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_moderation_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_moderator_action_type`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_moderator_action_type()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_post_clearance_change_type`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_post_clearance_change_type()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_protect_released_moderation_transparency_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_protect_released_moderation_transparency_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_record_story_post_related_url_projection_relation_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_record_story_post_related_url_projection_relation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_record_user_data_request_attempt`

```sql
CREATE OR REPLACE FUNCTION public.fn_record_user_data_request_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_refresh_rss_feed_item_unmapped_category_count`

```sql
CREATE OR REPLACE FUNCTION public.fn_refresh_rss_feed_item_unmapped_category_count()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_automatic_refund_receipt_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_automatic_refund_receipt_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_change_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_change_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_product_identity_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_product_identity_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_provider_lineage_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_provider_lineage_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_provider_observation_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_provider_observation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_refund_intent_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_refund_intent_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_mipr_case_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_mipr_case_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_mipr_case_op_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_mipr_case_op_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_mipr_succeeded_refund_observation_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_mipr_succeeded_refund_observation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_release_moderation_transparency_daily_rollup(p_day date, p_community_id uuid, p_metric text, p_category text, p_cutoff timestamp with time zone)`

```sql
CREATE OR REPLACE FUNCTION public.fn_release_moderation_transparency_daily_rollup(p_day date, p_community_id uuid, p_metric text, p_category text, p_cutoff timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_release_next_moderation_transparency_daily_rollup(p_community_id uuid, p_before date, p_cutoff timestamp with time zone)`

```sql
CREATE OR REPLACE FUNCTION public.fn_release_next_moderation_transparency_daily_rollup(p_community_id uuid, p_before date, p_cutoff timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_require_mipr_case_op_context`

```sql
CREATE OR REPLACE FUNCTION public.fn_require_mipr_case_op_context()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_require_mipr_succeeded_refund_observation_context`

```sql
CREATE OR REPLACE FUNCTION public.fn_require_mipr_succeeded_refund_observation_context()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_require_verified_membership_provider_observation_evidence`

```sql
CREATE OR REPLACE FUNCTION public.fn_require_verified_membership_provider_observation_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reverse_hostname_labels(p_hostname text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_reverse_hostname_labels(p_hostname text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
```

## `fn_review_succession_topic_ids_are_sorted_distinct(topic_ids uuid[])`

```sql
CREATE OR REPLACE FUNCTION public.fn_review_succession_topic_ids_are_sorted_distinct(topic_ids uuid[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
```

## `fn_stamp_agent_moderation_transparency`

```sql
CREATE OR REPLACE FUNCTION public.fn_stamp_agent_moderation_transparency()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_stamp_clearance_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_stamp_clearance_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_stamp_moderation_appeal_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_stamp_moderation_appeal_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_stamp_moderation_report_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_stamp_moderation_report_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_stamp_moderator_action_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_stamp_moderator_action_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_ap_post_likes`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_ap_post_likes()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_fediverse_instance_integration_status`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_fediverse_instance_integration_status()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_posts_search_vector`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_posts_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_rss_feed_is_discoverable`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_rss_feed_is_discoverable()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_rss_feed_is_enabled`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_rss_feed_is_enabled()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_rss_feed_items_search_vector`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_rss_feed_items_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_url_hostname_blocked`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_url_hostname_blocked()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_text_to_timestamptz(text_value text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_text_to_timestamptz(text_value text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
```

## `fn_update_topic_bookmark_stats_for_topic_id(target_topic_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_topic_bookmark_stats_for_topic_id(target_topic_id uuid)
 RETURNS void
 LANGUAGE sql
```

## `fn_update_updated_at`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_user_bookmark_stats_for_user_id(target_user_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_user_bookmark_stats_for_user_id(target_user_id uuid)
 RETURNS void
 LANGUAGE sql
```

## `fn_user_deletion_has_remaining_owned_data(target_user_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_user_deletion_has_remaining_owned_data(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
```

## `fn_validate_admin_import_row_target`

```sql
CREATE OR REPLACE FUNCTION public.fn_validate_admin_import_row_target()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_validate_user_landing_page_group_member_item_type`

```sql
CREATE OR REPLACE FUNCTION public.fn_validate_user_landing_page_group_member_item_type()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_wilson_score_lower_bound(pos double precision, tot double precision)`

```sql
CREATE OR REPLACE FUNCTION public.fn_wilson_score_lower_bound(pos double precision, tot double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
```

## `membership_grant_remaining_duration(grant_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.membership_grant_remaining_duration(grant_id uuid)
 RETURNS interval
 LANGUAGE sql
 STABLE PARALLEL SAFE
```

## `repair_post_category_finalization_admission_response_on_delete`

```sql
CREATE OR REPLACE FUNCTION public.repair_post_category_finalization_admission_response_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
```
