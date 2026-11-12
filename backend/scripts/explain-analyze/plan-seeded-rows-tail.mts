import * as rss from './seed-data/rss-feed-weekly-proxy.mts'
import * as prompt from './community-agent-prompt-page-ids.mts'
import { UPLOAD_CLEANUP_TOTAL_ROWS } from './seed-data/upload-cleanup-cohort.mts'
import { LANDING_PAGE_REVIEW_COUNT } from './seed-data/landing-page-candidates.mts'
import { REPORT_CONTEXT_SEED_ROW_COUNT } from './seed-data/moderation-report-context-counts.mts'
import { PURGE_EVIDENCE_ARTIFACT_SEEDED_ROWS } from './seed-data/copyright-case-purge-volume.mts'
import * as friendTrust from './seed-data/friend-trusted-hostnames.mts'
import { ANCILLARY_SEED_ROW_UPPER_BOUND } from './plan-ancillary-seeded-rows.mts'
import * as claimantMisuse from './seed-data/claimant-misuse-windows.mts'

export const TAIL_SEEDED_ROWS_BY_RELATION: Readonly<Record<string, number>> = {
  hostname_votes: 1 + friendTrust.FRIEND_TRUST_VOTE_ROWS,
  households: 100,
  api_keys: 256,
  blocklisted_domains: 20_512,
  gemini_embedding_2_embeddings: 256,
  membership_products: 4,
  membership_provider_observations: 0,
  membership_source_states: 300,
  membership_sources: 300,
  memberships: 300,
  podcast_shows: 0,
  post_review_topic_ratings: 1_001 + LANDING_PAGE_REVIEW_COUNT * 2,
  post_slugs: 1_256 + LANDING_PAGE_REVIEW_COUNT,
  relation__post__related__url: 2,
  relation__topic__parent__topic: 1_500,
  relation__user__mute__topic: 0,
  relation__user__proxy_follow__community: 101 + rss.RSS_FEED_WEEKLY_PROXY_NOISE_FOLLOW_COUNT,
  relation__user__proxy_mute__community: 200,
  relation__user__save__post: 5_000,
  topic_metrics: 5_000,
  user_phone_numbers: 0,
  user_referral_program_links: 13_002,
  agents: ANCILLARY_SEED_ROW_UPPER_BOUND + prompt.COMMUNITY_AGENT_PROMPT_TOTAL_ROWS,
  classifier_decision_batches: 6_000,
  community_list_rss_feeds: ANCILLARY_SEED_ROW_UPPER_BOUND + 10_050,
  copyright_notice_evidence_artifacts: PURGE_EVIDENCE_ARTIFACT_SEEDED_ROWS,
  copyright_notice_form_intake_reviews: 1,
  copyright_notice_target_images: 2,
  copyright_notice_form_screening_attempts: 2,
  copyright_notice_submissions:
    claimantMisuse.CLAIMANT_MISUSE_EVENT_COUNT + ANCILLARY_SEED_ROW_UPPER_BOUND,
  copyright_claimant_misuse_events: claimantMisuse.CLAIMANT_MISUSE_EVENT_COUNT,
  copyright_notices: claimantMisuse.CLAIMANT_MISUSE_NOTICE_COUNT + ANCILLARY_SEED_ROW_UPPER_BOUND,
  household_members: 101,
  image_placements: 5_000,
  images: UPLOAD_CLEANUP_TOTAL_ROWS + 5_000,
  individuals: 100,
  media_placements: 5_000,
  media_delivery_registry_records: 5_000,
  media_delivery_registry_changes: 10_000,
  moderation_reports: REPORT_CONTEXT_SEED_ROW_COUNT,
  post_clearance_changes: 100_001,
  post_data_point_topics: 1_000,
  post_explicit_topic_categories: 2_500,
  post_images: 5_000,
  post_topic_alias_sources: 2_860,
  post_topic_recommendations: 501,
  relation__post__category__topic: 50_000,
  relation__post__category__topic__votes: 1_000,
  relation__rss_feed_item__category__topic: 10_000,
  relation__rss_feed_item__category__topic__votes: 1_000,
  relation__user__follow__post: 5_000,
  stories: 10_000,
  topic_classifier_results: 1_000,
}
