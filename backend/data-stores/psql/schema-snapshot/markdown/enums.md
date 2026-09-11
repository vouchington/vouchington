# Enums

[Schema index](README.md).

## `admin_import_types`

- `topic`
- `rss_feed`
- `crm_contact`

## `agent_model_providers`

- `openai`
- `apple_foundation`
- `anthropic`
- `windows_foundry`
- `openai_compatible`
- `android_aicore`

## `agent_models`

- `gpt-5.4-nano`
- `apple-foundation-system`
- `claude-sonnet-5`
- `phi-silica`
- `windows-system-language-model`
- `android-aicore-system`

## `agent_name`

- `research`

## `agent_response_termination_reason`

- `no_tool_calls`
- `max_iterations`
- `stalled`
- `error`

## `agent_types`

- `moderator`
- `autotagger`
- `storyteller`
- `recommender`

## `api_key_types`

- `rss`
- `mcp`

## `app_attestation_environments`

- `production`
- `development`

## `bedrock_embedding_batch_job_types`

- `topics`
- `posts`
- `rss_feed_items`
- `crawl_chunks`
- `images`

## `broadcast_types`

- `everyone`
- `users`
- `followers`
- `mutual_followers`

## `community_agent_prompt_change_action`

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

## `community_prompt_on_flag_action`

- `none`
- `unpublish`

## `community_restriction_types`

- `require_post_approval`
- `no_new_member_posts`
- `no_links`
- `approved_members_only`

## `community_visibility_types`

- `public`
- `private`

## `consent_types`

- `privacy_policy`
- `terms_of_service`
- `cookie_analytics`

## `conversation_channel_types`

- `chat`
- `customer_support`
- `crm`
- `direct_message`
- `modmail`
- `mod_internal`

## `conversation_message_agentic_runs_events_types`

- `function_call`
- `model_response`

## `conversation_message_agentic_runs_termination_reasons`

- `no_tool_calls`
- `max_topics`
- `max_iterations`
- `stalled`
- `error`
- `superseded`

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

## `crawl_network_errors`

- `timeout`
- `dns`
- `ssrf`

## `crawler_types`

- `fetch`
- `automation`

## `crm_contact_lifecycle_change_types`

- `manual_update`
- `mark_contacted`
- `mark_responded`
- `mark_converted`
- `clear_converted`
- `mark_opted_out`
- `clear_opted_out`
- `archive`

## `crm_contact_sources`

- `csv_import`
- `manual`
- `inbound_email`
- `referral`

## `crm_contact_types`

- `influencer`
- `customer`
- `partner`

## `crm_contact_verticals`

- `credit_cards`
- `travel`
- `cars`
- `ai`
- `technology`
- `finance`
- `lifestyle`
- `other`

## `crm_email_providers`

- `ses`
- `gmail_smtp`

## `crm_social_platforms`

- `instagram`
- `tiktok`
- `youtube`
- `x`
- `linkedin`

## `domain_blacklist_types`

- `url`
- `email`

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

## `list_item_types`

- `rss_feed_item`
- `post`

## `list_visibility`

- `private`
- `unlisted`
- `public`

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

## `membership_operation_kinds`

- `cancel_source`
- `automatic_refund`
- `ineligible_purchase_reversal`
- `collision_resolution`

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

## `moderation_appeal_action`

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

## `moderation_judgement_action`

- `no_action`
- `warn`
- `remove`
- `escalate`

## `moderation_media_reveal_surfaces`

- `mod_queue`
- `review_queue`
- `reports`
- `post_page`

## `moderation_report_entity_type`

- `rss_feed_item`
- `post`
- `comment`
- `user`
- `url_hostname`

## `moderation_report_reason`

- `spam`
- `harassment`
- `misinformation`
- `illegal_content`
- `other`
- `vote_manipulation`

## `moderation_report_resolution_action`

- `reviewed`
- `actioned`
- `dismissed`

## `moderation_training_event_type`

- `automod_reviewed`
- `manual_action_inferred`
- `report_resolved`
- `dispute_resolved`
- `appeal_resolved`
- `draft_edited`
- `agent_accuracy_voted`
- `prompt_test_labelled`

## `moderation_training_label`

- `true_positive`
- `false_positive`
- `false_negative_candidate`
- `true_negative`
- `accepted`
- `edited`
- `rejected`
- `not_applicable`

## `moderation_training_source_type`

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
- `tag`
- `suspend`
- `unsuspend`
- `remove_member`
- `change_role`
- `resolve_report`
- `dismiss_report`
- `resolve_appeal`
- `dismiss_appeal`

## `moderator_on_flag_action`

- `none`
- `review_queue`

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

## `notification_push_endpoint_status`

- `pending`
- `delivered`
- `permanently_failed`

## `notification_push_intent_status`

- `pending`
- `delivered`
- `suppressed`

## `passkey_device_types`

- `singleDevice`
- `multiDevice`

## `podcast_itunes_types`

- `episodic`
- `serial`

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

## `review_dispute_action`

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

## `review_dispute_reason`

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

## `ses_bounce_types`

- `permanent`
- `transient`
- `undetermined`

## `ses_notification_types`

- `bounce`
- `complaint`
- `delivery`

## `spending_frequencies`

- `monthly`
- `annually`

## `support_message_directions`

- `inbound`
- `outbound`

## `support_message_lifecycle_change_types`

- `create_draft`
- `edit_draft`
- `approve`
- `send`

## `support_thread_lifecycle_change_types`

- `assign`
- `resolve`
- `reopen`

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

## `user_display_name_source`

- `username`
- `facebook`
- `x`
- `apple`
- `google`
- `linkedin`
- `microsoft`
- `github`

## `user_import_request_entity_types`

- `topic`
- `rss_feed`

## `user_landing_page_group_member_types`

- `review`
- `referral_link`

## `user_landing_page_item_types`

- `profile_link`
- `review`
- `referral_link`
- `topic_group`
- `link`

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

## `verified_identity_statuses`

- `active`
- `revoked`
- `transferred`

## `vote_integrity_flag_types`

- `velocity_spike`
- `ip_correlation`

## `vote_integrity_resolutions`

- `dismissed`
- `penalized`
- `suspended`
