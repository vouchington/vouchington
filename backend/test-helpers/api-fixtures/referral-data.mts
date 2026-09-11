import { post, timestamp, user } from './data.mts'

export const referralProgram = {
  id: 'referral-program-1',
  slug: 'test-card',
  name: 'Test Card',
  label: 'Test card',
  url: 'https://example.com/cards/test-card',
  referral_link_count: 2,
  trending_score: 9,
  link_count: 2,
}

export const referralProgramTopic = {
  __entity_type: 'topic',
  id: referralProgram.id,
  name: 'Test Referral Program',
  slug: 'test-referral-program',
  markdown: 'A referral program used by native client parity tests.',
  aliases: [],
  topic_type: 'referral_program',
  noindex: false,
  allow_reviews: true,
  created_at: timestamp,
  hostname_id: null,
  hostname: null,
  homepage_url_id: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  referral_program_slug: null,
  lingua_rs_detected_language: null,
  created_by: { id: user.id, username: user.username, roles: [] },
  updated_by: { id: user.id, username: user.username, roles: [] },
}

export const referralLink = {
  id: 'referral-link-1',
  user_id: user.id,
  referral_program_id: referralProgram.id,
  url_id: 'url-referral-1',
  url: 'https://example.com/apply/test-card',
  label: 'My test card link',
  activated_at: timestamp,
  deactivated_at: null,
  deleted_at: null,
  last_crawl_id: null,
  last_crawl_success_at: null,
  last_crawl_failure_at: null,
  consecutive_crawl_failures: 0,
  created_at: timestamp,
  updated_at: timestamp,
  referral_program_name: referralProgram.name,
  referral_program_slug: referralProgram.slug,
  parent_link_id: null,
  unfurl_requested_at: null,
  unfurl_completed_at: null,
  unfurl_failed_at: null,
  unfurl_last_error: null,
}

export const referralLinkFeedUser = {
  id: user.id,
  username: user.username,
  display_name: user.name,
  profile_image_id: user.profile_image_id,
}

export const referralLinkUser = {
  id: user.id,
  username: user.username,
  display_name: user.name,
}

export const referralLinkFeedItem = {
  id: referralLink.id,
  user_id: user.id,
  referral_program_id: referralProgram.id,
  referral_program_name: referralProgram.name,
  referral_program_slug: referralProgram.slug,
  url: referralLink.url,
  label: referralLink.label,
}

export const prioritizedReferralLink = {
  id: referralLink.id,
  user_id: user.id,
  is_official: false,
  referral_program_id: referralProgram.id,
  url: referralLink.url,
  label: referralLink.label,
  priority_group: 1,
  contribution_rank: 1,
  tier_rank: 1,
  best_score: 4.8,
  review_post_id: post.id,
  review_post_slug: 'fixture-post',
  review_avg_rating: 4.5,
}

export const referralClickLogUser = {
  __entity_type: 'user',
  id: 'user-2',
  username: 'newmember',
  roles: [],
  profile_image_id: null,
}

export const referralClickLog = {
  __entity_type: 'referral_click_log',
  id: 'referral-click-1',
  landing_url: 'https://voucha.ai/@alice',
  signed_up_at: '2026-03-01T12:00:00Z',
  user_id: referralClickLogUser.id,
  created_at: '2026-03-01T11:55:00Z',
}

export const referralClickLogPending = {
  __entity_type: 'referral_click_log',
  id: 'referral-click-2',
  landing_url: 'https://voucha.ai/@alice/cards',
  signed_up_at: null,
  user_id: null,
  created_at: '2026-03-02T09:00:00Z',
}
