import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts } from './helpers.mts'

async function seedPlaywrightPaginationReviews(query: TransactionQuery): Promise<void> {
  const bulkReviewValues = Array.from({ length: 20 }, (_, i) => {
    const idx = (i + 0x50).toString(16)
    return `(
      '019c64e6-f720-7002-a002-0000000000${idx}',
      'review',
      'Pagination test review ${idx}: This is a seeded review to ensure the /reviews page has enough items for infinite scroll pagination testing.',
      decode('000000000000000000000000000000000000000000000000000000000000ff${idx}', 'hex'),
      decode('000000000000000000000000000000000000000000000000000000000000ff${idx}', 'hex'),
      'system'
    )`
  }).join(',\n        ')
  await query(`
  INSERT INTO posts (
    id,
    post_type,
    markdown,
    bedrock_nova_multimodal_v1_content_sha256,
    llm_moderation_content_sha256,
    created_via
  )
  VALUES
    ${bulkReviewValues}
  ON CONFLICT (id) DO NOTHING
      `)
  await approveSeedPosts(
    query,
    Array.from({ length: 20 }, (_, i) => {
      const idx = (i + 0x50).toString(16)
      return `019c64e6-f720-7002-a002-0000000000${idx}`
    }),
  )
  const bulkRatingValues = Array.from({ length: 20 }, (_, i) => {
    const idx = (i + 0x50).toString(16)
    const rating = (i % 5) + 1
    return `('019c64e6-f720-7002-a002-0000000000${idx}', '019c64e6-f710-74cb-b36d-130af8ff1067', ${rating}, 0)`
  }).join(',\n        ')
  await query(`
  INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index)
  VALUES
    ${bulkRatingValues}
  ON CONFLICT (post_id, topic_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    order_index = EXCLUDED.order_index
      `)
  await query(
    `UPDATE relation__post__category__topic SET votes_score_up = 1, votes_count_up = 1 WHERE object_id IN ( '019c64e6-f710-74cb-b36d-130af8ff1067', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', '019c64e6-f716-722f-b05c-f4c4f7b93cd0' )`,
  )
  await query(
    `INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index) VALUES ('019c64e6-f720-7002-a002-000000000010', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', 5, 0), ('019c64e6-f720-7002-a002-000000000011', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', 4, 0), ('019c64e6-f720-7002-a002-000000000012', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', 5, 0) ON CONFLICT (post_id, topic_id) DO UPDATE SET rating = EXCLUDED.rating, order_index = EXCLUDED.order_index`,
  )
  await query(`DELETE FROM posts WHERE id = '019c64e6-f720-7002-a002-000000000020'`)
  await query(
    `INSERT INTO posts ( id, post_type, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256, created_via ) VALUES ( '019c64e6-f720-7002-a002-000000000020', 'review', 'Comparing Chase Sapphire Preferred vs American Express Gold. Both are excellent travel cards but serve different purposes.', decode('000000000000000000000000000000000000000000000000000000000000000e', 'hex'), decode('000000000000000000000000000000000000000000000000000000000000000e', 'hex'), 'system' ) ON CONFLICT (id) DO NOTHING`,
  )
  await approveSeedPosts(query, ['019c64e6-f720-7002-a002-000000000020'])
  await query(
    `INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index) VALUES ('019c64e6-f720-7002-a002-000000000020', '019c64e6-f710-74cb-b36d-130af8ff1067', 5, 0), ('019c64e6-f720-7002-a002-000000000020', '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', 3, 1) ON CONFLICT (post_id, topic_id) DO UPDATE SET rating = EXCLUDED.rating, order_index = EXCLUDED.order_index`,
  )
}

export { seedPlaywrightPaginationReviews }
