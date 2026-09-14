import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts, markSeedPostsMarkdownVisible } from './helpers.mts'

async function seedPlaywrightDiscussionPosts(
  query: TransactionQuery,
  _testUserEmail: string,
): Promise<void> {
  /* v8 ignore start -- exercised by Playwright global setup, not Vitest coverage */
  await query(
    `INSERT INTO posts ( id, post_type, title, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-f720-7001-a001-000000000001', 'discussion', 'What are the best ways to redeem Chase Ultimate Rewards points?', 'I''m trying to figure out the best ways to redeem my Chase Ultimate Rewards points for maximum value. What redemption options give the best value?', decode('0000000000000000000000000000000000000000000000000000000000000004', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000004', 'hex') ), ( '019c64e6-f720-7001-a001-000000000002', 'discussion', 'How does the Priority Pass lounge access work with this card?', 'Can someone explain how to use Priority Pass with the Sapphire Preferred? Do I need to register separately?', decode('0000000000000000000000000000000000000000000000000000000000000005', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000005', 'hex') ), ( '019c64e6-f720-7001-a001-000000000003', 'discussion', 'Does the $50 annual hotel credit include taxes and fees?', 'When using the annual hotel credit, do taxes and resort fees count toward the $50, or is it only the base room rate?', decode('0000000000000000000000000000000000000000000000000000000000000006', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000006', 'hex') ), ( '019c64e6-f720-7001-a001-000000000004', 'discussion', 'Is the $300 travel credit easy to use?', 'Can the $300 travel credit be used on any airline or hotel booking?', decode('00000000000000000000000000000000000000000000000000000000000000e1', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000e1', 'hex') ), ( '019c64e6-f720-7002-a002-000000000001', 'review', 'Great travel card', 'Great travel card! The 60k point welcome bonus was easy to earn. I hit the minimum spend in 2 months and the points posted immediately.', decode('0000000000000000000000000000000000000000000000000000000000000007', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000007', 'hex') ), ( '019c64e6-f720-7002-a002-000000000002', 'review', 'Travel insurance benefits', 'Travel insurance benefits are comprehensive and easy to use. Had to file a claim for delayed baggage and the process was straightforward.', decode('0000000000000000000000000000000000000000000000000000000000000008', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000008', 'hex') ), ( '019c64e6-f720-7003-a003-000000000001', 'data_point', 'Approval data point', 'Approved with 720 credit score, $85k income, 3/24 status. Applied online and got instant approval.', decode('0000000000000000000000000000000000000000000000000000000000000009', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000009', 'hex') ), ( '019c64e6-f720-7003-a003-000000000002', 'data_point', 'DoorDash credit timing', 'Statement credit for DoorDash posted within 3 business days after the qualifying purchase.', decode('000000000000000000000000000000000000000000000000000000000000000a', 'hex'), decode('000000000000000000000000000000000000000000000000000000000000000a', 'hex') ) ON CONFLICT (id) DO NOTHING`,
  )
  await approveSeedPosts(query, [
    '019c64e6-f720-7001-a001-000000000001',
    '019c64e6-f720-7001-a001-000000000002',
    '019c64e6-f720-7001-a001-000000000003',
    '019c64e6-f720-7001-a001-000000000004',
    '019c64e6-f720-7002-a002-000000000001',
    '019c64e6-f720-7002-a002-000000000002',
    '019c64e6-f720-7003-a003-000000000001',
    '019c64e6-f720-7003-a003-000000000002',
  ])
  await markSeedPostsMarkdownVisible(query, ['019c64e6-f720-7002-a002-000000000001'])
  await query(
    `INSERT INTO relation__post__category__topic (subject_id, object_id, created_by_id) VALUES ('019c64e6-f720-7001-a001-000000000001', '019c64e6-f710-74cb-b36d-130af8ff1067', NULL), ('019c64e6-f720-7001-a001-000000000002', '019c64e6-f710-74cb-b36d-130af8ff1067', NULL), ('019c64e6-f720-7003-a003-000000000001', '019c64e6-f710-74cb-b36d-130af8ff1067', NULL), ('019c64e6-f720-7003-a003-000000000002', '019c64e6-f710-74cb-b36d-130af8ff1067', NULL) ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, title, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-f720-7001-a001-000000000090', 'discussion', 'Playwright trending topic fixture', 'Seeded discussion used to keep current-window trending topic coverage deterministic.', decode('0000000000000000000000000000000000000000000000000000000000000090', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000090', 'hex') ) ON CONFLICT (id) DO UPDATE SET post_type = EXCLUDED.post_type, title = EXCLUDED.title, markdown = EXCLUDED.markdown, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 = EXCLUDED.llm_moderation_content_sha256, deleted_at = NULL, archived_at = NULL`,
  )
  await approveSeedPosts(query, ['019c64e6-f720-7001-a001-000000000090'])
  await query(
    `DELETE FROM relation__post__category__topic WHERE subject_id = '019c64e6-f720-7001-a001-000000000090' AND object_id = '019c64e6-f710-74cb-b36d-130af8ff1067'`,
  )
  await query(
    `INSERT INTO relation__post__category__topic ( subject_id, object_id, created_by_id, votes_score_up, votes_count_up ) VALUES ( '019c64e6-f720-7001-a001-000000000090', '019c64e6-f710-74cb-b36d-130af8ff1067', NULL, 10, 10 )`,
  )
  /* v8 ignore stop */
  await query(
    `INSERT INTO post_data_point_topics (post_id, topic_id, order_index) VALUES ('019c64e6-f720-7003-a003-000000000001', '019c64e6-f710-74cb-b36d-130af8ff1067', 0), ('019c64e6-f720-7003-a003-000000000002', '019c64e6-f710-74cb-b36d-130af8ff1067', 1) ON CONFLICT (post_id, topic_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index) VALUES ('019c64e6-f720-7002-a002-000000000001', '019c64e6-f710-74cb-b36d-130af8ff1067', 5, 0), ('019c64e6-f720-7002-a002-000000000002', '019c64e6-f710-74cb-b36d-130af8ff1067', 4, 0) ON CONFLICT (post_id, topic_id) DO UPDATE SET rating = EXCLUDED.rating, order_index = EXCLUDED.order_index`,
  )
  await query(
    `INSERT INTO post_slugs (post_id, slug) VALUES ('019c64e6-f720-7002-a002-000000000001', 'great-travel-card'), ('019c64e6-f720-7002-a002-000000000002', 'travel-insurance-benefits') ON CONFLICT (slug) DO NOTHING`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, title, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-f720-7005-a005-000000000001', 'article', 'Beginner''s guide to credit card rewards', 'Welcome to the Voucha guide to credit card rewards. Learn how to earn and redeem points and miles effectively.', decode('00000000000000000000000000000000000000000000000000000000000000f0', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f0', 'hex') ), ( '019c64e6-f720-7006-a006-000000000001', 'blog_post', 'What''s new on Voucha this week', 'Latest updates from the Voucha team on new features and improvements.', decode('00000000000000000000000000000000000000000000000000000000000000f1', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f1', 'hex') ) ON CONFLICT (id) DO NOTHING`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, title, markdown, ai_summary_markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-f720-7004-a004-000000000001', 'story', 'Behind the points and miles community', '', 'An AI-summarized story about the rewards community discussions this week.', decode('00000000000000000000000000000000000000000000000000000000000000f2', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f2', 'hex') ) ON CONFLICT (id) DO NOTHING`,
  )
  await approveSeedPosts(query, [
    '019c64e6-f720-7004-a004-000000000001',
    '019c64e6-f720-7005-a005-000000000001',
    '019c64e6-f720-7006-a006-000000000001',
  ])
  await query(
    `INSERT INTO post_slugs (post_id, slug) VALUES ('019c64e6-f720-7004-a004-000000000001', 'playwright-story-fixture'), ('019c64e6-f720-7005-a005-000000000001', 'playwright-article-fixture'), ('019c64e6-f720-7006-a006-000000000001', 'playwright-blog-post-fixture') ON CONFLICT (slug) DO NOTHING`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-f720-7002-a002-000000000010', 'review', 'Excellent for dining! The 4X points at restaurants add up quickly.', decode('000000000000000000000000000000000000000000000000000000000000000b', 'hex'), decode('000000000000000000000000000000000000000000000000000000000000000b', 'hex') ), ( '019c64e6-f720-7002-a002-000000000011', 'review', 'The $120 dining credit makes the annual fee worth it.', decode('000000000000000000000000000000000000000000000000000000000000000c', 'hex'), decode('000000000000000000000000000000000000000000000000000000000000000c', 'hex') ), ( '019c64e6-f720-7002-a002-000000000012', 'review', 'Great for everyday spending, especially groceries and restaurants.', decode('000000000000000000000000000000000000000000000000000000000000000d', 'hex'), decode('000000000000000000000000000000000000000000000000000000000000000d', 'hex') ) ON CONFLICT (id) DO NOTHING`,
  )
  await approveSeedPosts(query, [
    '019c64e6-f720-7002-a002-000000000010',
    '019c64e6-f720-7002-a002-000000000011',
    '019c64e6-f720-7002-a002-000000000012',
  ])
}

export { seedPlaywrightDiscussionPosts }
