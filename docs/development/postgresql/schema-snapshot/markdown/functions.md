# Functions

[Schema index](README.md).

## `fn_apply_moderation_transparency_daily_rollup(p_occurred_at timestamp with time zone, p_community_id uuid, p_metric moderation_transparency_metrics, p_category moderation_transparency_categories, p_delta integer)`

```sql
CREATE OR REPLACE FUNCTION public.fn_apply_moderation_transparency_daily_rollup(p_occurred_at timestamp with time zone, p_community_id uuid, p_metric moderation_transparency_metrics, p_category moderation_transparency_categories, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_classifier_audit_actor_was_deleted(actor_user_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_classifier_audit_actor_was_deleted(actor_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
```

## `fn_complete_membership_verification_processing_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_complete_membership_verification_processing_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_copyright_retention_erasable_columns(table_name text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_copyright_retention_erasable_columns(table_name text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
```

## `fn_copyright_retention_erasure_permitted(table_name text, old_row jsonb, new_row jsonb)`

```sql
CREATE OR REPLACE FUNCTION public.fn_copyright_retention_erasure_permitted(table_name text, old_row jsonb, new_row jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
```

## `fn_create_google_play_acknowledgement_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_google_play_acknowledgement_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_media_delivery_generation_change`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_media_delivery_generation_change()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_membership_verification_processing_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_membership_verification_processing_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_metrics`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_metrics()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_create_user_individual_household`

```sql
CREATE OR REPLACE FUNCTION public.fn_create_user_individual_household()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_current_copyright_form_screening(submission_id uuid, screening_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_current_copyright_form_screening(submission_id uuid, screening_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
```

## `fn_ensure_retained_actor_identity`

```sql
CREATE OR REPLACE FUNCTION public.fn_ensure_retained_actor_identity()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_ensure_retained_identity(family retained_identity_families, identity_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_ensure_retained_identity(family retained_identity_families, identity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_field_changes(before_fields jsonb, after_fields jsonb)`

```sql
CREATE OR REPLACE FUNCTION public.fn_field_changes(before_fields jsonb, after_fields jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
```

## `fn_finalize_membership_operation_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_finalize_membership_operation_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_copyright_eu_dispute_settlement_outcome`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_copyright_eu_dispute_settlement_outcome()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_copyright_territorial_decision`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_copyright_territorial_decision()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_guard_membership_operation_work_lease`

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_membership_operation_work_lease()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_image_placement_publicly_projected(p_placement_id uuid, p_revision integer, p_image_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_image_placement_publicly_projected(p_placement_id uuid, p_revision integer, p_image_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
```

## `fn_immutable_array_to_string(p_array text[], p_delimiter text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_immutable_array_to_string(p_array text[], p_delimiter text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
```

## `fn_initialize_membership_operation_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_initialize_membership_operation_work()
 RETURNS trigger
 LANGUAGE plpgsql
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

## `fn_lock_bluesky_follow_receipt_active_users`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_bluesky_follow_receipt_active_users()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_lock_moderation_transparency_projection(p_domain text, p_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_lock_moderation_transparency_projection(p_domain text, p_id uuid)
 RETURNS void
 LANGUAGE sql
```

## `fn_membership_grant_remaining_duration(grant_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_membership_grant_remaining_duration(grant_id uuid)
 RETURNS interval
 LANGUAGE sql
 STABLE PARALLEL SAFE
```

## `fn_notification_target_entity(notification_entity_type notification_entity_types, notification_community_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_notification_target_entity(notification_entity_type notification_entity_types, notification_community_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
```

## `fn_prepare_copyright_action_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_prepare_copyright_action_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_prepare_copyright_delivery_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_prepare_copyright_delivery_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_activitypub_inbox_delivery_retention`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_activitypub_inbox_delivery_retention()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_activitypub_inbox_delivery_storage_after_delete`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_activitypub_inbox_delivery_storage_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_activitypub_inbox_delivery_storage_after_insert`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_activitypub_inbox_delivery_storage_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_activitypub_inbox_delivery_storage_after_update`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_activitypub_inbox_delivery_storage_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_activitypub_post_likes`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_activitypub_post_likes()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_capture_notification_push_intent`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_capture_notification_push_intent()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_community_image_placements`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_community_image_placements()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_handoff_deleted_user_image_surfaces`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_handoff_deleted_user_image_surfaces()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_latest_change`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_latest_change()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_mark_topic_alias_category_mapping_dirty`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_mark_topic_alias_category_mapping_dirty()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_agent_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_agent_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_agent_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_agent_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_agent_update_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_agent_update_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_appeals_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_appeals_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_appeals_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_appeals_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_appeals_update_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_appeals_update_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_clearance_delete_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_clearance_delete_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_moderation_transparency_clearance_insert_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_moderation_transparency_clearance_insert_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_record_user_data_request_attempt`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_record_user_data_request_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_refresh_rss_feed_item_unmapped_category_count`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_refresh_rss_feed_item_unmapped_category_count()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_retire_deleted_profile_link_image_surfaces`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_retire_deleted_profile_link_image_surfaces()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_retire_deleted_user_image_surfaces`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_retire_deleted_user_image_surfaces()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_story_post_related_url_relation_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_story_post_related_url_relation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_topic_aliases`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_topic_aliases()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_topic_image_placements`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_topic_image_placements()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_transparency_rollup`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_transparency_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_url_hostname_blocked`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_url_hostname_blocked()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_user_profile_image_placement`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_user_profile_image_placement()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_project_user_profile_link_image_placement`

```sql
CREATE OR REPLACE FUNCTION public.fn_project_user_profile_link_image_placement()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_record_copyright_action_attempt`

```sql
CREATE OR REPLACE FUNCTION public.fn_record_copyright_action_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_record_copyright_delivery_attempt`

```sql
CREATE OR REPLACE FUNCTION public.fn_record_copyright_delivery_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_record_oauth_authorization_exchange_transition`

```sql
CREATE OR REPLACE FUNCTION public.fn_record_oauth_authorization_exchange_transition()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_register_retained_identity`

```sql
CREATE OR REPLACE FUNCTION public.fn_register_retained_identity()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_register_retained_image_identity`

```sql
CREATE OR REPLACE FUNCTION public.fn_register_retained_image_identity()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_admin_import_row_target`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_admin_import_row_target()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_agent_moderation_transparency_projection`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_agent_moderation_transparency_projection()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_agent_system_account`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_agent_system_account()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_activation_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_activation_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_batch_candidate_configuration`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_batch_candidate_configuration()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_batch_candidate_owner_delete`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_batch_candidate_owner_delete()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_candidate_community_override_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_candidate_community_override_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_candidate_effective_thresholds`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_candidate_effective_thresholds()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_candidate_threshold_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_candidate_threshold_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_decision_batch_completion`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_decision_batch_completion()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_result_batch_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_result_batch_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_classifier_run`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_classifier_run()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_community_prompt_result_configuration`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_community_prompt_result_configuration()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_action_intent`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_action_intent()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_assessment_source`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_assessment_source()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_automated_assessment_screening`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_automated_assessment_screening()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_correspondence`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_correspondence()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_counter_notice_assessment_target_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_counter_notice_assessment_target_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_deadline`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_delivery_intent_transition`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_delivery_intent_transition()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_human_actor`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_human_actor()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_immutable_with_actor_erasure`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_immutable_with_actor_erasure()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_lifecycle_event_source_notice`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_lifecycle_event_source_notice()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_notice_identity`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_notice_identity()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_notice_immutable_evidence`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_notice_immutable_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_notice_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_notice_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_notice_submission`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_notice_submission()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_repeat_infringer_incident`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_repeat_infringer_incident()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_repeat_infringer_review`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_repeat_infringer_review()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_restriction_assessment_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_restriction_assessment_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_restriction_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_restriction_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_screening_attempt_rewind`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_screening_attempt_rewind()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_territorial_acknowledgment_attempt`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_territorial_acknowledgment_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_copyright_territorial_escalation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_copyright_territorial_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_follower_distribution_recipient_bounds`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_follower_distribution_recipient_bounds()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_global_classifier_candidate_override`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_global_classifier_candidate_override()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_image_surface_placement`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_image_surface_placement()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_media_placement`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_media_placement()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_administrator_refund_request_context`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_administrator_refund_request_context()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_grant_activation_period_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_grant_activation_period_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_grant_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_grant_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_lineage_binding_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_lineage_binding_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_operation_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_operation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_provider_evidence_immutability`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_provider_evidence_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_provider_lineage_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_provider_lineage_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_refund_metadata_scan_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_refund_metadata_scan_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_refund_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_refund_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_refund_operation_attempt_context`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_refund_operation_attempt_context()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_membership_refund_operation_attempt_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_membership_refund_operation_attempt_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_moderation_appeal_resolution`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_moderation_appeal_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_ownerless_image_surface_retirement`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_ownerless_image_surface_retirement()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_platform_account_kind_change`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_platform_account_kind_change()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_purchase_reversal_case_operation_context`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_purchase_reversal_case_operation_context()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_purchase_reversal_refund_observation_currency`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_purchase_reversal_refund_observation_currency()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_review_dispute_subject_snapshot`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_review_dispute_subject_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_review_succession_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_review_succession_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_review_succession_topic_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_review_succession_topic_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_review_succession_topics`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_review_succession_topics()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_role_user_is_not_system`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_role_user_is_not_system()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_terminal_lifecycle`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_terminal_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_user_landing_page_group_member_item_type`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_user_landing_page_group_member_item_type()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_user_legal_preservation_hold_mutation`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_user_legal_preservation_hold_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_verified_membership_provider_observation_evidence`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_verified_membership_provider_observation_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_web_push_endpoint_owner_subscription`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_web_push_endpoint_owner_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_reject_web_push_subscription_owner`

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_web_push_subscription_owner()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_release_moderation_transparency_daily_rollup(p_day date, p_community_id uuid, p_metric moderation_transparency_metrics, p_category moderation_transparency_categories, p_cutoff timestamp with time zone)`

```sql
CREATE OR REPLACE FUNCTION public.fn_release_moderation_transparency_daily_rollup(p_day date, p_community_id uuid, p_metric moderation_transparency_metrics, p_category moderation_transparency_categories, p_cutoff timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_release_next_moderation_transparency_daily_rollup(p_community_id uuid, p_before date, p_cutoff timestamp with time zone)`

```sql
CREATE OR REPLACE FUNCTION public.fn_release_next_moderation_transparency_daily_rollup(p_community_id uuid, p_before date, p_cutoff timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_reverse_hostname_labels(p_hostname text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_reverse_hostname_labels(p_hostname text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
```

## `fn_schedule_copyright_form_screening_work`

```sql
CREATE OR REPLACE FUNCTION public.fn_schedule_copyright_form_screening_work()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_schedule_media_delivery_projection`

```sql
CREATE OR REPLACE FUNCTION public.fn_schedule_media_delivery_projection()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_sync_image_surface_placement(p_surface_kind image_surface_placement_surface_kinds, p_image_id uuid, p_user_id uuid, p_topic_id uuid, p_community_id uuid, p_user_profile_link_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_image_surface_placement(p_surface_kind image_surface_placement_surface_kinds, p_image_id uuid, p_user_id uuid, p_topic_id uuid, p_community_id uuid, p_user_profile_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
```

## `fn_text_to_timestamptz(text_value text)`

```sql
CREATE OR REPLACE FUNCTION public.fn_text_to_timestamptz(text_value text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
```

## `fn_update_agent_moderation_transparency`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_agent_moderation_transparency()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_classifier_run_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_classifier_run_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_clearance_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_clearance_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_media_delivery_change_authority`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_media_delivery_change_authority()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_media_delivery_registry_generation`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_media_delivery_registry_generation()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_moderation_report_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_moderation_report_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_notification_publication_target`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_notification_publication_target()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_parent_notice_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_parent_notice_scope()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_posts_search_vector`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_posts_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_rss_feed_items_search_vector`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_rss_feed_items_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
```

## `fn_update_topic_bookmark_stats_for_topic_id(target_topic_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_topic_bookmark_stats_for_topic_id(target_topic_id uuid)
 RETURNS void
 LANGUAGE sql
```

## `fn_update_transparency_scope`

```sql
CREATE OR REPLACE FUNCTION public.fn_update_transparency_scope()
 RETURNS trigger
 LANGUAGE plpgsql
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

## `fn_wilson_score_lower_bound(pos double precision, tot double precision)`

```sql
CREATE OR REPLACE FUNCTION public.fn_wilson_score_lower_bound(pos double precision, tot double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
```
