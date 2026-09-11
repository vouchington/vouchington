import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts } from './helpers.mts'

async function seedPlaywrightAuthoredRelations(query: TransactionQuery): Promise<void> {
  await query(
    `DELETE FROM posts WHERE id IN ( '019c64e6-f740-7001-a111-000000000001', '019c64e6-f740-7002-a222-000000000001' )`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, title, markdown, created_by_id, bedrock_nova_multimodal_v1_content_sha256, openai_omni_moderation_content_sha256, llm_moderation_content_sha256 ) VALUES ( '019c64e6-f740-7001-a111-000000000001', 'discussion', 'Test user discussion', 'A seeded discussion authored by the Playwright test user.', '019f0000-0000-7000-8000-000000000000', decode('00000000000000000000000000000000000000000000000000000000000000d1', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000d1', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000d1', 'hex') ), ( '019c64e6-f740-7002-a222-000000000001', 'review', 'Test user review', 'A seeded review authored by the Playwright test user.', '019f0000-0000-7000-8000-000000000000', decode('00000000000000000000000000000000000000000000000000000000000000d2', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000d2', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000d2', 'hex') ) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, markdown = EXCLUDED.markdown, created_by_id = EXCLUDED.created_by_id, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256, openai_omni_moderation_content_sha256 = EXCLUDED.openai_omni_moderation_content_sha256, llm_moderation_content_sha256 = EXCLUDED.llm_moderation_content_sha256`,
  )
  await approveSeedPosts(query, [
    '019c64e6-f740-7001-a111-000000000001',
    '019c64e6-f740-7002-a222-000000000001',
  ])
  await query(
    `INSERT INTO relation__post__category__topic (subject_id, object_id, created_by_id) VALUES ( '019c64e6-f740-7001-a111-000000000001', '019c64e6-f710-74cb-b36d-130af8ff1067', '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT (subject_id, object_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index) VALUES ( '019c64e6-f740-7002-a222-000000000001', '019c64e6-f710-74cb-b36d-130af8ff1067', 5, 0 ) ON CONFLICT (post_id, topic_id) DO UPDATE SET rating = EXCLUDED.rating, order_index = EXCLUDED.order_index`,
  )
  await query(
    `UPDATE relation__post__category__topic SET votes_score_up = 1, votes_count_up = 1 WHERE subject_id = '019c64e6-f740-7001-a111-000000000001' AND object_id = '019c64e6-f710-74cb-b36d-130af8ff1067'`,
  )
  await query(
    `INSERT INTO relation__post__category__topic (subject_id, object_id, created_by_id) VALUES ( '019c64e6-f720-7001-a001-000000000001', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', '019f0000-0000-7000-8000-000000000000' ), ( '019c64e6-f720-7002-a002-000000000001', '019c64e6-f716-722f-b05c-f4c4f7b93cd0', '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT DO NOTHING`,
  )
  await query(
    `UPDATE relation__post__category__topic SET votes_score_up = 10, votes_count_up = 10, deleted_at = NULL WHERE subject_id = '019c64e6-f720-7001-a001-000000000001' AND object_id = '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1'`,
  )
  await query(
    `INSERT INTO relation__post__related__post (subject_id, object_id, created_by_id) VALUES ( '019c64e6-f720-7001-a001-000000000001', '019c64e6-f720-7002-a002-000000000001', '019f0000-0000-7000-8000-000000000000' ), ( '019c64e6-f720-7001-a001-000000000002', '019c64e6-f720-7001-a001-000000000003', '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__topic__related__topic (subject_id, object_id, created_by_id) VALUES ( '019c64e6-f710-74cb-b36d-130af8ff1067', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', '019f0000-0000-7000-8000-000000000000' ), ( '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', '019c64e6-f716-722f-b05c-f4c4f7b93cd0', '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO relation__topic__faq__post (subject_id, object_id, created_by_id) VALUES ( '019c64e6-f710-74cb-b36d-130af8ff1067', '019c64e6-f720-7001-a001-000000000001', '019f0000-0000-7000-8000-000000000000' ), ( '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', '019c64e6-f720-7001-a001-000000000002', '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT DO NOTHING`,
  )
  await query(`UPDATE relation__post__category__topic SET votes_score_up = 10, votes_count_up = 10`)
  await query(`UPDATE relation__post__related__post SET votes_score_up = 10, votes_count_up = 10`)
  await query(`UPDATE relation__topic__related__topic SET votes_score_up = 10, votes_count_up = 10`)
  await query(`UPDATE relation__topic__faq__post SET votes_score_up = 10, votes_count_up = 10`)
}

export { seedPlaywrightAuthoredRelations }
