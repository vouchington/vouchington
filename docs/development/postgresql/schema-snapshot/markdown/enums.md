# Enums

[Schema index](README.md).

## `agent_model_providers`

- `openai`
- `apple_foundation`
- `anthropic`
- `windows_foundry`
- `openai_compatible`
- `android_aicore`
- `openrouter`

## `agent_models`

- `gpt-5.4-nano`
- `apple-foundation-system`
- `claude-sonnet-5`
- `phi-silica`
- `windows-system-language-model`
- `android-aicore-system`
- `openai/gpt-5.4-nano`

## `agent_types`

- `moderator`
- `autotagger`
- `storyteller`
- `classifier`

## `ai_usage_record_pricing_statuses`

- `priced`
- `unpriced`

## `amazon_ses_bounce_types`

- `permanent`
- `transient`
- `undetermined`

## `amazon_ses_notification_types`

- `bounce`
- `complaint`
- `delivery`

## `api_key_types`

- `rss`
- `mcp`

## `api_scopes`

- `account-enforcement:penalize`
- `account-enforcement:read`
- `account-enforcement:suspend`
- `account-enforcement:vote-weight`
- `account-enforcement:write`
- `analytics:read`
- `appeals:read`
- `appeals:write`
- `bookmarks:read`
- `bookmarks:write`
- `cards:read`
- `cards:write`
- `communities:read`
- `communities:write`
- `copyright-notices:read`
- `copyright-notices:write`
- `data-points:read`
- `disputes:read`
- `disputes:write`
- `domain-ratings:read`
- `editorial:read`
- `editorial:write`
- `entity-relations:read`
- `entity-relations:write`
- `feeds:read`
- `financial-profile:read`
- `financial-profile:write`
- `hostnames:read`
- `lists:read`
- `lists:write`
- `mcp.admin:read`
- `mcp.admin:write`
- `mcp.user:read`
- `mcp.user:write`
- `moderation:agent-votes`
- `moderation:ai-rerun`
- `moderation:approve`
- `moderation:read`
- `moderation:write`
- `notifications:read`
- `notifications:write`
- `point-valuations:read`
- `point-valuations:write`
- `post-relations.owned-private:write`
- `posts:read`
- `posts:write`
- `preferences:read`
- `preferences:write`
- `profile:read`
- `profile:write`
- `recommendations:read`
- `reference-data:read`
- `referral-links:read`
- `referral-links:write`
- `reports:write`
- `rewards-statuses:read`
- `rewards-statuses:write`
- `rss-feed-items:read`
- `rss-feeds:read`
- `rss:read`
- `site-operations:config`
- `site-operations:jobs`
- `site-operations:queues`
- `site-operations:read`
- `spending:read`
- `spending:write`
- `topic-recommendations:read`
- `topic-recommendations:write`
- `topics:read`
- `users:read`
- `web-search:read`

## `app_attestation_environments`

- `production`
- `development`

## `bedrock_embedding_batch_job_types`

- `topics`
- `posts`
- `rss_feed_items`
- `crawl_chunks`
- `images`

## `bluesky_link_authorization_statuses`

- `pending`
- `callback_claimed`
- `handoff_ready`
- `attached`
- `revoked`
- `expired`
- `rejected`

## `broadcast_types`

- `everyone`
- `users`
- `followers`
- `mutual_followers`

## `classifier_candidate_kinds`

- `topic`
- `story`
- `community_prompt`

## `classifier_model_providers`

- `typesafe`
- `openrouter`

## `classifier_primitives`

- `noul`
- `choice`
- `score`

## `classifier_run_terminal_failure_kinds`

- `provider-error`
- `invalid-result`
- `context-rejected`
- `attempts-exhausted`
- `client-unavailable`
- `sweep-bound-exceeded`

## `classifier_scope_categories`

- `global`
- `community_ai`

## `community_agent_prompt_revision_types`

- `created`
- `updated`
- `deleted`
- `allocated`
- `deallocated`
- `deactivated`

## `community_application_question_field_types`

- `short_text`
- `long_text`
- `single_select`
- `multi_select`
- `checkbox`

## `community_automod_actions`

- `record_only`
- `review_queue`
- `unpublish`

## `community_list_item_types`

- `topic`
- `rss_feed`
- `post`
- `url_hostname`
- `url`

## `community_list_types`

- `follow`
- `mute`

## `community_member_roles`

- `owner`
- `moderator`
- `member`

## `community_member_roster_visibility_types`

- `public`
- `users`
- `members`
- `moderators`

## `community_post_review_change_types`

- `approve`
- `reject`
- `unpublish`
- `restore`

## `community_post_review_platform_override_actions`

- `approve`
- `reject`
- `unpublish`
- `restore`

## `community_restriction_types`

- `require_post_approval`
- `no_new_member_posts`
- `no_links`
- `approved_members_only`

## `consent_types`

- `privacy_policy`
- `terms_of_service`
- `cookie_analytics`

## `content_creation_channels`

- `web`
- `swift`
- `dotnet`
- `api`
- `mcp`
- `system`

## `contribution_policy_sources`

- `discussion`
- `review`
- `comment`
- `data_point`
- `link`
- `story`
- `rss_item_discussion`
- `topic_recommendation`
- `article`
- `blog_post`

## `conversation_channel_types`

- `chat`
- `direct_message`
- `modmail`
- `mod_internal`

## `conversation_message_directions`

- `inbound`
- `outbound`

## `conversation_message_kinds`

- `chat`
- `email`
- `note`
- `message`

## `conversation_participant_add_policies`

- `owner_only`
- `all_members`

## `conversation_participant_roles`

- `owner`
- `admin`
- `member`

## `copyright_automatic_withholding_refusal_reasons`

- `thresholds_unset`
- `switch_on_unrecorded`
- `received_before_switch_on`
- `claimant_unavailable`
- `claimant_suspended`
- `trust_below_minimum`
- `account_too_new`
- `claimant_daily_cap`
- `poster_daily_cap`
- `non_post_target`

## `copyright_claimant_misuse_event_outcomes`

- `notice_withdrawn`
- `notice_rejected`
- `restriction_reversed_by_counter_notice`
- `restriction_reversed_by_appeal`

## `copyright_dsa_statement_attempt_outcomes`

- `submitted`
- `retryable_failure`
- `permanent_failure`
- `replayed`

## `copyright_eu_dispute_settlement_results`

- `decided_for_recipient`
- `decided_for_platform`
- `withdrawn`
- `no_decision`

## `copyright_jurisdictions`

- `us_dmca`
- `eu_dsa`
- `uk`
- `other`

## `copyright_notice_action_intent_actions`

- `withhold`
- `restore`

## `copyright_notice_action_intent_states`

- `pending`
- `claimed`
- `completed`
- `stale`
- `blocked`
- `failed`

## `copyright_notice_appeal_recommendation_outcomes`

- `confirm`
- `modify`
- `reverse`
- `uncertain`

## `copyright_notice_correspondence_kinds`

- `receipt`
- `request_information`
- `restriction_notice`
- `decision_notice`
- `counter_notice_forwarding`
- `restoration_notice`
- `status_update`
- `inbound_message`

## `copyright_notice_correspondence_message_composition_kinds`

- `inbound`
- `deterministic_template`
- `staff`
- `agent`

## `copyright_notice_correspondence_message_directions`

- `inbound`
- `outbound`

## `copyright_notice_delivery_intent_channels`

- `in_app`
- `email`

## `copyright_notice_delivery_intent_recipient_roles`

- `claimant`
- `poster`
- `informed_owner`
- `correspondent`

## `copyright_notice_delivery_intent_states`

- `pending`
- `claimed`
- `sent`
- `failed`
- `bounced`

## `copyright_notice_delivery_kinds`

- `owner_information_notice`
- `redress_decision_notice`
- `claimant_receipt`
- `status_update`
- `poster_restriction_notice`
- `poster_review_notice`
- `poster_restoration_notice`
- `claimant_decision_notice`
- `counter_notice_forwarding`
- `staff_information_request`
- `email_intake_rejected`
- `email_intake_needs_information`
- `email_intake_received`

## `copyright_notice_email_correspondence_review_actions`

- `pending`
- `admitted`
- `rejected`

## `copyright_notice_email_correspondence_review_kinds`

- `complaint`
- `supplement`
- `appeal`
- `counter_notice`
- `withdrawal`
- `court_or_ccb_hold`

## `copyright_notice_email_intake_link_kinds`

- `initial`
- `thread`

## `copyright_notice_email_intake_parse_statuses`

- `succeeded`
- `failed`

## `copyright_notice_email_intake_review_decisions`

- `approved`
- `rejected`
- `legal_process`

## `copyright_notice_email_thread_reference_kinds`

- `message_id`
- `reply_reference`

## `copyright_notice_form_screening_attempt_states`

- `pending`
- `failed`
- `completed`

## `copyright_notice_form_screening_recommendations`

- `not_obviously_invalid`
- `invalid_or_spam`

## `copyright_notice_legal_bases`

- `copyright`

## `copyright_notice_legal_hold_assessment_ccb_claim_kinds`

- `claim`
- `counterclaim`

## `copyright_notice_legal_hold_assessment_proceeding_kinds`

- `federal_court`
- `ccb`

## `copyright_notice_legal_hold_resolution_kinds`

- `dismissed`
- `proceeding_ended`
- `superseded`

## `copyright_notice_lifecycle_change_recovery_sources`

- `durable_review`
- `durable_decision`

## `copyright_notice_lifecycle_change_replay_reasons`

- `operator_replay`

## `copyright_notice_lifecycle_change_types`

- `notice_received`
- `supplement_received`
- `appeal_received`
- `counter_notice_received`
- `withdrawal_received`
- `court_or_ccb_hold_received`
- `submission_assessed`
- `appeal_reviewed`
- `counter_notice_reviewed`
- `evidence_artifact_recorded`
- `outbound_correspondence_created`
- `agent_correspondence_approved`
- `email_correspondence_admitted`
- `email_correspondence_rejected`
- `provisional_restriction_imposed`
- `mandatory_human_review_completed`
- `restriction_lifted_by_administrator`
- `legal_hold_assessed`
- `legal_hold_resolved`
- `counter_notice_deadline_started`
- `restoration_intent_created`
- `reversal_restoration_intent_created`
- `copyright_action_replayed`
- `delivery_intent_replayed`
- `media_delivery_registry_replayed`
- `restoration_unavailable`
- `restriction_lifted_placement_retained`
- `restoration_authorized_pending_delivery`
- `placement_withheld`
- `placement_restored`
- `guest_capability_issued`
- `guest_capability_revoked`
- `guest_capability_revoked_by_withdrawal`

## `copyright_notice_submission_kinds`

- `complaint`
- `notice`
- `supplement`
- `appeal`
- `counter_notice`
- `withdrawal`
- `court_or_ccb_hold`

## `copyright_notice_submission_source_kinds`

- `signed_in_form`
- `guest_form`
- `email`
- `staff`

## `copyright_repeat_infringer_disposition_kinds`

- `withdrawn`
- `duplicate`
- `abusive`

## `copyright_repeat_infringer_review_outcomes`

- `warning`
- `no_action`
- `restrict`
- `terminate`
- `reinstatement`

## `copyright_restriction_human_review_actions`

- `confirm`
- `modify`
- `reverse`

## `copyright_review_actions`

- `confirm`
- `reverse`

## `copyright_staydown_match_kinds`

- `exact`
- `perceptual`

## `copyright_territorial_decision_automation_disclosures`

- `human`

## `copyright_territorial_decision_outcomes`

- `restrict`
- `no_action`

## `copyright_territorial_notice_routing_destinations`

- `staff_queue`

## `copyright_territorial_party_roles`

- `notifier`
- `poster`
- `reviewer`

## `copyright_territorial_redress_decision_staff_dispositions`

- `maintain`
- `revoke`

## `copyright_trusted_flagger_change_types`

- `suspended`
- `reinstated`
- `revoked`

## `copyright_trusted_flagger_expertise_areas`

- `intellectual_property`
- `other`

## `crawl_network_errors`

- `timeout`
- `dns`
- `ssrf`

## `crawler_types`

- `fetch`
- `automation`

## `curated_aside_item_types`

- `topic`
- `source`
- `community`

## `digest_frequencies`

- `none`
- `daily`
- `weekly`

## `domain_blocklist_types`

- `url`
- `email`

## `elected_entity_relations`

- `relation__user__category__topic`
- `relation__post__category__topic`
- `relation__post__category__topic_alias`
- `relation__post__related__post`
- `relation__post__related__url`
- `relation__topic__related__topic`
- `relation__topic__category__topic`
- `relation__topic__publisher_type__topic`
- `relation__topic__faq__post`
- `relation__topic__related__post`
- `relation__topic__related__url`
- `relation__topic__faq__url`
- `relation__topic__guide__url`
- `relation__topic__landing_page__url`
- `relation__topic__terms_of_service__url`
- `relation__rss_feed_item__category__topic`
- `relation__rss_feed_item__category__topic_alias`

## `email_security_verdicts`

- `pass`
- `fail`
- `gray`
- `processing_failed`
- `unknown`

## `engagement_email_types`

- `follow_topics`
- `post_referral_link`
- `follow_news_sources`

## `fediverse_integration_statuses`

- `pending`
- `approved`
- `blocked`

## `follower_distribution_actions`

- `post_share`
- `post_send`
- `rss_feed_item_share`
- `rss_feed_item_send`

## `follower_distribution_audiences`

- `all_followers`
- `selected_followers`

## `http_request_methods`

- `GET`
- `HEAD`
- `POST`
- `PUT`
- `DELETE`
- `CONNECT`
- `OPTIONS`
- `TRACE`
- `PATCH`

## `identity_verification_attempt_sources`

- `self_paid`
- `membership_included`
- `support_grant`

## `identity_verification_providers`

- `stripe_identity`

## `identity_verification_statuses`

- `unverified`
- `payment_pending`
- `identity_pending`
- `verified`
- `failed`
- `duplicate_id`

## `image_binding_families`

- `post`
- `surface`

## `image_surface_placement_surface_kinds`

- `user-profile-image`
- `topic-logo-image`
- `topic-hero-image`
- `community-profile-image`
- `community-banner-image`
- `user-profile-link-image`

## `import_entity_types`

- `topic`
- `rss_feed`

## `list_visibilities`

- `private`
- `unlisted`
- `public`

## `mcp_call_audit_event_outcomes`

- `accepted`
- `tool_error`
- `invalid_request`
- `invalid_arguments`
- `not_found`
- `role_denied`
- `plan_denied`
- `scopes_undeclared`
- `insufficient_scope`
- `rate_limited`

## `mcp_call_audit_event_surfaces`

- `mcp`
- `admin_mcp`

## `media_delivery_desired_states`

- `allow`
- `withheld`

## `media_delivery_registry_change_types`

- `pending`
- `claimed`
- `completed`
- `failed`

## `media_placement_retirement_reasons`

- `asset_deleted`
- `owner_removed`

## `membership_billing_intervals`

- `monthly`
- `yearly`

## `membership_change_types`

- `source_observed`
- `renewal`
- `upgrade`
- `downgrade`
- `sku_migration`
- `cancellation`
- `pause`
- `reactivation`
- `expiration`
- `admin_grant`
- `admin_revoke`
- `refund`

## `membership_google_play_acknowledgment_skip_reasons`

- `no_longer_eligible`

## `membership_google_play_recovery_sweeps`

- `notifications`
- `active_sources`
- `acknowledgements`

## `membership_operation_kinds`

- `cancel_source`
- `automatic_refund`
- `ineligible_purchase_reversal`
- `collision_resolution`
- `administrator_refund`

## `membership_plan_slugs`

- `plus`
- `pro`

## `membership_provider_environments`

- `test`
- `production`

## `membership_provider_kinds`

- `stripe`
- `apple_app_store`
- `google_play`
- `microsoft_store`
- `admin`

## `membership_refund_reasons`

- `goodwill`
- `requested`
- `dispute`
- `other`

## `membership_refund_sources`

- `admin`
- `stripe_dashboard`

## `membership_source_kinds`

- `direct`
- `family`
- `admin_grant`

## `membership_verification_result_codes`

- `verified`
- `competing_direct_source`
- `invalid_evidence`
- `wrong_account`
- `wrong_application`
- `wrong_environment`
- `wrong_product`
- `revoked`
- `expired`
- `purchase_pending`
- `missing_account_token`
- `stale_evidence`

## `moderation_appeal_actions`

- `accept`
- `deny`
- `reduce`

## `moderation_appeal_lifecycle_change_types`

- `create`
- `ai_draft`
- `edit`
- `approve`
- `send`
- `resolve_accept`
- `resolve_deny`
- `resolve_reduce`
- `dismiss`

## `moderation_appeal_post_removal_kinds`

- `platform`
- `community`

## `moderation_email_cadences`

- `daily`
- `selected_days`
- `weekly`

## `moderation_judgement_actions`

- `no_action`
- `warn`
- `remove`
- `escalate`

## `moderation_media_reveal_surfaces`

- `mod_queue`
- `review_queue`
- `reports`
- `post_page`

## `moderation_report_entity_types`

- `rss_feed_item`
- `post`
- `comment`
- `user`
- `url_hostname`

## `moderation_report_reasons`

- `spam`
- `harassment`
- `misinformation`
- `illegal_content`
- `other`
- `vote_manipulation`

## `moderation_report_resolution_actions`

- `reviewed`
- `actioned`
- `dismissed`

## `moderation_training_event_types`

- `automod_reviewed`
- `manual_action_inferred`
- `report_resolved`
- `dispute_resolved`
- `appeal_resolved`
- `draft_edited`
- `agent_accuracy_voted`
- `prompt_test_labelled`

## `moderation_training_human_actions`

- `reinstate`
- `keep_removed`
- `label_only`
- `dismiss`
- `resolve_accept`
- `resolve_reduce`
- `resolve_remove`
- `resolve_annotate`
- `report_reviewed`
- `report_dismissed`
- `report_actioned`
- `clearance_approved`
- `clearance_rejected`
- `clearance_pending`
- `clearance_in_review`
- `approve_publication`
- `reject_publication`
- `unpublish_post`
- `accuracy_upvote`
- `accuracy_downvote`
- `accuracy_unvote`
- `save_prompt_test_run`

## `moderation_training_labels`

- `true_positive`
- `false_positive`
- `false_negative_candidate`
- `true_negative`
- `accepted`
- `edited`
- `rejected`
- `not_applicable`

## `moderation_training_source_types`

- `agent_moderation`
- `openai_omni`
- `spam_detection`
- `community_prompt`
- `community_review`
- `moderation_report`
- `moderation_appeal`
- `review_dispute`
- `agent_moderation_vote`
- `prompt_test_run`

## `moderation_transparency_categories`

- `accept`
- `activate_restriction`
- `agent_moderation`
- `agent_moderation_vote_delete`
- `agent_moderation_vote_set`
- `appeal_resolution_draft_rerun`
- `approve`
- `article_sync_run`
- `backfill_run`
- `ban`
- `change_role`
- `community_ai`
- `crawler_create`
- `crawler_delete`
- `crawler_update`
- `deny`
- `dismiss_appeal`
- `dismiss_report`
- `dispute_resolution_draft_rerun`
- `harassment`
- `illegal_content`
- `import_batch_create`
- `lift_ban`
- `lift_restriction`
- `lock`
- `misinformation`
- `mod_note_delete`
- `oauth_client_unverify`
- `oauth_client_verify`
- `openai_omni`
- `other`
- `pin`
- `post_clearance_reject`
- `preservation_hold_place`
- `preservation_hold_release`
- `queue_pause`
- `queue_resume`
- `queue_retry_failed`
- `reduce`
- `reject`
- `remove`
- `remove_member`
- `report_claim`
- `report_deescalate`
- `report_escalate`
- `report_integrity_flag_review`
- `report_integrity_penalty_apply`
- `report_integrity_penalty_revoke`
- `report_judgement_rerun`
- `report_unclaim`
- `resolve_appeal`
- `resolve_report`
- `rss_category_assign`
- `rss_category_reject`
- `rss_category_unreject`
- `scheduled_job_run`
- `spam`
- `spam_detection`
- `story_item_add`
- `story_item_remove`
- `story_official_item_set`
- `story_rename`
- `suspend`
- `topic_claim_reject`
- `topic_claim_revoke`
- `topic_claim_verify`
- `unlock`
- `unpin`
- `unsuspend`
- `vote_integrity_flag_review`
- `vote_integrity_penalty_apply`
- `vote_integrity_penalty_revoke`
- `vote_manipulation`
- `vote_weight_reset`
- `vote_weight_set`
- `warn`

## `moderation_transparency_metrics`

- `reports`
- `moderation_actions`
- `automated_moderation`
- `appeals`

## `moderator_action_types`

- `remove`
- `approve`
- `reject`
- `ban`
- `lift_ban`
- `activate_restriction`
- `lift_restriction`
- `warn`
- `lock`
- `unlock`
- `pin`
- `unpin`
- `suspend`
- `unsuspend`
- `remove_member`
- `change_role`
- `resolve_report`
- `dismiss_report`
- `resolve_appeal`
- `dismiss_appeal`
- `topic_claim_verify`
- `topic_claim_reject`
- `topic_claim_revoke`
- `report_claim`
- `report_unclaim`
- `report_escalate`
- `report_deescalate`
- `report_integrity_flag_review`
- `report_integrity_penalty_apply`
- `report_integrity_penalty_revoke`
- `vote_integrity_flag_review`
- `vote_integrity_penalty_apply`
- `vote_integrity_penalty_revoke`
- `vote_weight_set`
- `vote_weight_reset`
- `agent_moderation_vote_set`
- `agent_moderation_vote_delete`
- `mod_note_delete`
- `report_judgement_rerun`
- `appeal_resolution_draft_rerun`
- `dispute_resolution_draft_rerun`
- `oauth_client_verify`
- `oauth_client_unverify`
- `story_item_add`
- `story_item_remove`
- `story_official_item_set`
- `story_rename`
- `crawler_create`
- `crawler_update`
- `crawler_delete`
- `rss_category_assign`
- `rss_category_reject`
- `rss_category_unreject`
- `queue_pause`
- `queue_resume`
- `queue_retry_failed`
- `scheduled_job_run`
- `backfill_run`
- `article_sync_run`
- `import_batch_create`
- `preservation_hold_place`
- `preservation_hold_release`

## `notification_delete_reasons`

- `system_pruned`
- `user_deleted`

## `notification_delivery_types`

- `subscription`
- `manual_send`

## `notification_entity_types`

- `post`
- `rss_feed_item`
- `follow`
- `referral_signup`
- `referral_click`
- `moderation_report`
- `review_dispute`
- `user_warning`
- `moderation_appeal`
- `community_ban`
- `direct_message`
- `modmail`
- `critical_moderation_alert`
- `community_application_decision`
- `community_role_change`
- `community_ownership_transfer`
- `community_activity_digest`
- `copyright_notice`

## `notification_push_endpoint_statuses`

- `pending`
- `delivered`
- `permanently_failed`

## `notification_push_intent_statuses`

- `pending`
- `delivered`
- `suppressed`

## `notification_target_intents`

- `notifications_inbox`

## `oauth_authorization_providers`

- `facebook`
- `x`
- `github`

## `oauth_authorization_purposes`

- `authenticate`
- `connect`

## `oauth_authorization_result_kinds`

- `authenticated`
- `mfa_required`
- `connected`

## `oauth_authorization_server_event_types`

- `consent_approved`
- `consent_denied`
- `access_token_revoked`
- `refresh_family_revoked`
- `refresh_reuse_detected`

## `oauth_authorization_statuses`

- `pending`
- `callback_received`
- `exchanging`
- `completion_ready`
- `completed`
- `rejected`
- `expired`

## `oauth_callback_modes`

- `web`
- `native`

## `oauth_client_token_endpoint_auth_methods`

- `none`
- `client_secret_basic`

## `oauth_client_types`

- `public`
- `confidential`

## `oauth_grant_types`

- `authorization_code`
- `refresh_token`

## `oauth_response_types`

- `code`

## `passkey_device_types`

- `singleDevice`
- `multiDevice`

## `platform_account_kinds`

- `official`
- `system`

## `podcast_itunes_types`

- `episodic`
- `serial`

## `post_admission_committed_statuses`

- `created`

## `post_admission_quota_consumption_modes`

- `all_windows`
- `daily_only`

## `post_admission_reservation_states`

- `in_progress`
- `committed`

## `post_admission_routes`

- `internal`
- `authored.create`
- `posts.create`
- `communities.posts.create`
- `rss-feed-items.discussions.create`
- `stories.discussions.create`
- `topic-recommendations.create`
- `my.import.topics.recommendation`
- `communities.create`
- `reports.create`
- `disputes.create`
- `appeals.create`
- `communities.applications.create`

## `post_admission_scope_categories`

- `internal`
- `global`
- `community`
- `rss_item`
- `story`
- `topic_recommendation`
- `my.import.topics`

## `post_classifier_local_outcome_classifications`

- `ai`
- `human`

## `post_clearance_change_types`

- `approve`
- `reject`
- `mark_in_review`
- `reset_to_pending`

## `post_moderation_disposition_types`

- `pass`
- `review`
- `reject`
- `incomplete`

## `post_moderation_sources`

- `openai_omni`
- `spam_detection`
- `staff`

## `post_publication_identity_bridge_families`

- `post`
- `community`
- `rss_feed_item`
- `author`
- `rss_feed`
- `topic_alias`
- `story`

## `post_publication_reasons`

- `post_created`
- `post_updated`
- `post_content_reset`
- `post_audience_changed`
- `post_archived`
- `post_deleted`
- `post_topics_changed`
- `post_related_urls_changed`
- `post_ratings_changed`
- `post_clearance_changed`
- `post_moderation_flag_changed`
- `community_publication_changed`
- `moderation_appeal_resolved`
- `author_suspension_changed`
- `author_deleted`
- `community_visibility_changed`
- `rss_feed_discoverability_changed`
- `rss_feed_enablement_changed`
- `rss_feed_source_changed`

## `post_publication_receipt_cursor_kinds`

- `typed`

## `post_publication_source_cursor_kinds`

- `review`
- `data`
- `relation`
- `alias_source`
- `alias_relation`
- `static`
- `slug`
- `feed`

## `post_topic_alias_source_types`

- `title`
- `markdown`
- `explicit`

## `post_topic_recommendation_topic_types`

- `topic`
- `referral_program`
- `card`

## `post_types`

- `discussion`
- `review`
- `data_point`
- `topic_recommendation`
- `comment`
- `story`
- `link`
- `article`
- `blog_post`

## `privacy_types`

- `public`
- `private`

## `public_verified_name_displays`

- `hidden`
- `first_name`
- `first_name_last_initial`
- `full_name`

## `report_integrity_flag_types`

- `mass_report_suspected`

## `report_integrity_resolutions`

- `dismissed`
- `penalized`

## `retained_identity_cleanup_families`

- `user`
- `api_key`
- `topic`
- `post`
- `rss_feed_item`
- `image`
- `membership`

## `retained_identity_families`

- `user`
- `api_key`
- `topic`
- `post`
- `rss_feed_item`
- `membership`

## `review_dispute_actions`

- `no_action`
- `remove`
- `annotate`
- `dismiss`

## `review_dispute_lifecycle_change_types`

- `create`
- `ai_draft`
- `edit`
- `approve`
- `send`
- `resolve_remove`
- `resolve_annotate`
- `dismiss`

## `review_dispute_reasons`

- `factually_inaccurate`
- `defamatory`
- `impersonation`
- `privacy_violation`
- `other`

## `revision_types`

- `create`
- `update`
- `delete`

## `rss_feed_content_types`

- `article`
- `podcast`
- `video`
- `mixed`

## `rss_feed_item_media_types`

- `article`
- `audio`
- `video`

## `rss_feed_setting_change_types`

- `enablement`
- `discoverability`

## `spending_frequencies`

- `monthly`
- `annually`

## `topic_claim_verification_methods`

- `dns_txt`
- `well_known_file`
- `manual_admin`

## `topic_types`

- `topic`
- `rewards_program`
- `referral_program`
- `card`
- `rewards_program_status`
- `bank_account`
- `rss_feed`
- `fediverse_instance`

## `url_hostname_block_sources`

- `admin`
- `google_web_risk`
- `parent_hostname`

## `user_deletion_external_work_kinds`

- `cloudflare-cache-tag`
- `entity-relation-effects`
- `s3-export`
- `stripe-customer`

## `user_deletion_request_current_phases`

- `posts`
- `votes`
- `user-relations`
- `credentials`
- `account-data`
- `relation-impacts`
- `external-work`
- `finalize`

## `user_display_name_sources`

- `username`
- `facebook`
- `x`
- `apple`
- `google`
- `linkedin`
- `microsoft`
- `github`

## `user_landing_page_group_member_types`

- `review`
- `referral_link`

## `user_landing_page_item_types`

- `profile_link`
- `review`
- `referral_link`
- `topic_group`
- `link`

## `user_list_item_types`

- `rss_feed_item`
- `post`

## `user_privacy_audiences`

- `everyone`
- `users`
- `followers`
- `mutual_followers`
- `nobody`

## `user_profile_link_types`

- `url`
- `twitter`
- `facebook`
- `instagram`
- `github`
- `linkedin`
- `youtube`
- `tiktok`

## `user_rss_feed_import_row_outcomes`

- `followed`
- `imported`
- `source_created`
- `already_following`
- `error`

## `vote_integrity_flag_types`

- `velocity_spike`
- `ip_correlation`

## `vote_integrity_resolutions`

- `dismissed`
- `penalized`
- `suspended`
