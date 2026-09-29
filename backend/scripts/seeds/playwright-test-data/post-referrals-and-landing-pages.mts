import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts } from './helpers.mts'

async function seedPlaywrightReferralsAndLandingPages(query: TransactionQuery): Promise<void> {
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-b400-7000-b000-000000000001', 'referral_program', 'Chase Sapphire Referral', 'chase-sapphire-referral', decode('0000000000000000000000000000000000000000000000000000000000001004', 'hex') ) ON CONFLICT (slug) DO UPDATE SET topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO topics__referral_programs (topic_id) SELECT id FROM topics WHERE slug = 'chase-sapphire-referral' ON CONFLICT (topic_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-b401-7000-b000-000000000001', 'referral_program', 'Chase Sapphire Referral Picks', 'chase-sapphire-referral-picks', decode('0000000000000000000000000000000000000000000000000000000000001005', 'hex') ) ON CONFLICT (slug) DO UPDATE SET topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO topics__referral_programs (topic_id) SELECT id FROM topics WHERE slug = 'chase-sapphire-referral-picks' ON CONFLICT (topic_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO urls (id, url, hostname_id, pathname, search_params) VALUES ( '019c64e6-b500-7000-8000-000000000001', 'https://example.com/referral/test-friend', '019c64e6-1000-7000-b000-000000000001', '/referral/test-friend', '{}'::JSONB ) ON CONFLICT (url) DO NOTHING`,
  )
  await query(
    `INSERT INTO user_referral_program_links (id, user_id, referral_program_id, url_id, label, activated_at) SELECT '019c64e6-b500-7000-8000-000000000002', '00000000-0000-0000-0000-000000000001', id, '019c64e6-b500-7000-8000-000000000001', 'Test Friend Referral', CURRENT_TIMESTAMP FROM topics WHERE slug = 'chase-sapphire-referral' ON CONFLICT (id) DO UPDATE SET referral_program_id = EXCLUDED.referral_program_id, url_id = EXCLUDED.url_id, label = EXCLUDED.label, activated_at = EXCLUDED.activated_at`,
  )
  await query(
    `INSERT INTO urls (id, url, hostname_id, pathname, search_params, created_by_id) VALUES ( '019c64e6-b510-7000-b000-000000000001', 'https://example.com/tests-profile', '019c64e6-1000-7000-b000-000000000001', '/tests-profile', '{}'::JSONB, '019f0000-0000-7000-8000-000000000000' ), ( '019c64e6-b510-7000-b000-000000000002', 'https://example.com/tests-referral', '019c64e6-1000-7000-b000-000000000001', '/tests-referral', '{}'::JSONB, '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT (url) DO UPDATE SET created_by_id = EXCLUDED.created_by_id`,
  )
  await query(
    `INSERT INTO user_profile_links (id, user_id, link_type, sort_order, url_id, name) VALUES ( '019c64e6-b520-7000-b000-000000000001', '019f0000-0000-7000-8000-000000000000', 'url', 0, '019c64e6-b510-7000-b000-000000000001', 'Test profile link' ) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, sort_order = EXCLUDED.sort_order, url_id = EXCLUDED.url_id, name = EXCLUDED.name`,
  )
  await query(
    `INSERT INTO user_referral_program_links (id, user_id, referral_program_id, url_id, label, activated_at, deactivated_at, deleted_at) SELECT '019c64e6-b530-7000-b000-000000000001', '019f0000-0000-7000-8000-000000000000', id, '019c64e6-b510-7000-b000-000000000002', 'Apply with my referral', CURRENT_TIMESTAMP, NULL, NULL FROM topics WHERE slug = 'chase-sapphire-referral-picks' ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, referral_program_id = EXCLUDED.referral_program_id, label = EXCLUDED.label, activated_at = EXCLUDED.activated_at, deactivated_at = NULL, deleted_at = NULL`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, title, markdown, created_by_id, broadcast, privacy, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-b540-7000-b000-000000000001', 'review', 'My referral review', 'I use this referral offer because the bonus posts quickly and the terms are straightforward.', '019f0000-0000-7000-8000-000000000000', 'everyone', 'public', decode('0000000000000000000000000000000000000000000000000000000000001010', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000001010', 'hex') ) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, markdown = EXCLUDED.markdown, created_by_id = EXCLUDED.created_by_id, broadcast = EXCLUDED.broadcast, privacy = EXCLUDED.privacy`,
  )
  await approveSeedPosts(query, ['019c64e6-b540-7000-b000-000000000001'])
  await query(
    `INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index) SELECT '019c64e6-b540-7000-b000-000000000001', id, 5, 0 FROM topics WHERE slug = 'chase-sapphire-referral-picks' ON CONFLICT (post_id, topic_id) DO UPDATE SET rating = EXCLUDED.rating, order_index = EXCLUDED.order_index`,
  )
  await query(
    `DELETE FROM user_landing_page_group_members WHERE landing_page_item_id IN ( SELECT id FROM user_landing_page_items WHERE landing_page_id IN ( SELECT id FROM user_landing_pages WHERE user_id = '019f0000-0000-7000-8000-000000000000' ) )`,
  )
  await query(
    `DELETE FROM user_landing_page_items WHERE landing_page_id IN ( SELECT id FROM user_landing_pages WHERE user_id = '019f0000-0000-7000-8000-000000000000' )`,
  )
  await query(
    `DELETE FROM user_landing_pages WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `INSERT INTO user_landing_pages (id, user_id, title, subtitle, slug, is_default) VALUES ( '019c64e6-b550-7000-b000-000000000001', '019f0000-0000-7000-8000-000000000000', 'Test landing page', 'Links, reviews, and referral offers in one place.', 'main-links', TRUE ), ( '019c64e6-b550-7000-b000-000000000002', '019f0000-0000-7000-8000-000000000000', 'Bonus page', 'A second landing page for slug coverage.', 'bonus', FALSE ) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, slug = EXCLUDED.slug, is_default = EXCLUDED.is_default`,
  )
  await query(
    `INSERT INTO user_landing_page_items (id, landing_page_id, item_type, sort_order, profile_link_id, review_id, referral_link_id, topic_id) VALUES ( '019c64e6-b560-7000-b000-000000000001', '019c64e6-b550-7000-b000-000000000001', 'profile_link', 0, '019c64e6-b520-7000-b000-000000000001', NULL, NULL, NULL ), ( '019c64e6-b560-7000-b000-000000000002', '019c64e6-b550-7000-b000-000000000001', 'topic_group', 1, NULL, NULL, NULL, (SELECT id FROM topics WHERE slug = 'chase-sapphire-referral-picks') ), ( '019c64e6-b560-7000-b000-000000000003', '019c64e6-b550-7000-b000-000000000002', 'referral_link', 0, NULL, NULL, '019c64e6-b530-7000-b000-000000000001', NULL ) ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order, profile_link_id = EXCLUDED.profile_link_id, review_id = EXCLUDED.review_id, referral_link_id = EXCLUDED.referral_link_id, topic_id = EXCLUDED.topic_id`,
  )
  await query(
    `INSERT INTO user_landing_page_group_members (id, landing_page_item_id, member_type, sort_order, review_id, referral_link_id) VALUES ( '019c64e6-b570-7000-b000-000000000001', '019c64e6-b560-7000-b000-000000000002', 'review', 0, '019c64e6-b540-7000-b000-000000000001', NULL ), ( '019c64e6-b570-7000-b000-000000000002', '019c64e6-b560-7000-b000-000000000002', 'referral_link', 1, NULL, '019c64e6-b530-7000-b000-000000000001' ) ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order, review_id = EXCLUDED.review_id, referral_link_id = EXCLUDED.referral_link_id`,
  )
}

export { seedPlaywrightReferralsAndLandingPages }
