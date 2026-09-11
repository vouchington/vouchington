import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts } from './helpers.mts'

async function seedPlaywrightRewardsProfile(query: TransactionQuery): Promise<void> {
  const {
    rows: [testUserData],
  } = await query(
    `SELECT individual_id FROM users WHERE id = '019f0000-0000-7000-8000-000000000000' LIMIT 1`,
  )
  const testIndividualId = testUserData.individual_id
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-b100-7000-b000-000000000001', 'rewards_program', 'Chase Ultimate Rewards', 'chase-ultimate-rewards', decode('0000000000000000000000000000000000000000000000000000000000001001', 'hex') ) ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id, topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO topics__rewards_programs (topic_id) VALUES ('019c64e6-b100-7000-b000-000000000001') ON CONFLICT (topic_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO posts (id, post_type, title, markdown, bedrock_nova_multimodal_v1_content_sha256, openai_omni_moderation_content_sha256, llm_moderation_content_sha256) VALUES ( '019c64e6-b1a0-7001-8001-000000000001', 'discussion', 'Best ways to use Chase Ultimate Rewards', 'What redemption options give the best value for Chase Ultimate Rewards?', decode('0000000000000000000000000000000000000000000000000000000000000021', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000021', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000021', 'hex') ), ( '019c64e6-b1a0-7002-8002-000000000001', 'review', 'Great rewards program', 'Chase Ultimate Rewards is one of the best rewards programs with flexible redemption options.', decode('0000000000000000000000000000000000000000000000000000000000000022', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000022', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000022', 'hex') ), ( '019c64e6-b1a0-7003-8003-000000000001', 'data_point', 'Transfer partner value', 'Transferred 50k points to Hyatt and got 4 nights at a category 4 hotel.', decode('0000000000000000000000000000000000000000000000000000000000000023', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000023', 'hex'), decode('0000000000000000000000000000000000000000000000000000000000000023', 'hex') ) ON CONFLICT (id) DO UPDATE SET post_type = EXCLUDED.post_type, title = EXCLUDED.title, markdown = EXCLUDED.markdown, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256, openai_omni_moderation_content_sha256 = EXCLUDED.openai_omni_moderation_content_sha256, llm_moderation_content_sha256 = EXCLUDED.llm_moderation_content_sha256`,
  )
  await approveSeedPosts(query, [
    '019c64e6-b1a0-7001-8001-000000000001',
    '019c64e6-b1a0-7002-8002-000000000001',
    '019c64e6-b1a0-7003-8003-000000000001',
  ])
  await query(
    `INSERT INTO relation__post__category__topic (subject_id, object_id, created_by_id) VALUES ('019c64e6-b1a0-7001-8001-000000000001', '019c64e6-b100-7000-b000-000000000001', NULL), ('019c64e6-b1a0-7003-8003-000000000001', '019c64e6-b100-7000-b000-000000000001', NULL) ON CONFLICT (subject_id, object_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO post_data_point_topics (post_id, topic_id, order_index) VALUES ('019c64e6-b1a0-7003-8003-000000000001', '019c64e6-b100-7000-b000-000000000001', 0) ON CONFLICT (post_id, topic_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index) VALUES ('019c64e6-b1a0-7002-8002-000000000001', '019c64e6-b100-7000-b000-000000000001', 5, 0) ON CONFLICT (post_id, topic_id) DO UPDATE SET rating = EXCLUDED.rating, order_index = EXCLUDED.order_index`,
  )
  await query(
    `UPDATE relation__post__category__topic SET votes_score_up = 1, votes_count_up = 1 WHERE object_id = '019c64e6-b100-7000-b000-000000000001'`,
  )
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256, rewards_program_id) VALUES ( '019c64e6-b200-7000-b000-000000000001', 'rewards_program_status', 'Chase Sapphire Preferred Status', 'chase-sapphire-preferred-status', decode('0000000000000000000000000000000000000000000000000000000000001002', 'hex'), '019c64e6-b100-7000-b000-000000000001' ) ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id, topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256, rewards_program_id = EXCLUDED.rewards_program_id`,
  )
  await query(
    `INSERT INTO topics__rewards_program_statuses (topic_id) VALUES ('019c64e6-b200-7000-b000-000000000001') ON CONFLICT (topic_id) DO NOTHING`,
  )
  await query(
    `UPDATE topics SET referral_program_id = '019c64e6-b400-7000-b000-000000000001' WHERE id = '019c64e6-f710-74cb-b36d-130af8ff1067'`,
  )
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-b300-7000-b000-000000000001', 'topic', 'Groceries', 'groceries', decode('0000000000000000000000000000000000000000000000000000000000001003', 'hex') ) ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id, topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO topics__spending_categories (topic_id, default_spending_frequency) VALUES ('019c64e6-b300-7000-b000-000000000001', 'monthly') ON CONFLICT (topic_id) DO NOTHING`,
  )
  await query(
    `INSERT INTO individual_cards (id, individual_id, card_id, opened_on)
     SELECT ('019c64e6-c100-7000-b000-' || LPAD(sequence::text, 12, '0'))::uuid,
            $1,
            '019c64e6-f710-74cb-b36d-130af8ff1067',
            '2023-01-15'
       FROM GENERATE_SERIES(1, 26) AS sequence
     ON CONFLICT (id) DO UPDATE
       SET individual_id = EXCLUDED.individual_id,
           card_id = EXCLUDED.card_id,
           opened_on = EXCLUDED.opened_on`,
    [testIndividualId],
  )
  await query(
    `INSERT INTO spending_entries (id, individual_id, spending_category_id, amount_minor_units, currency_code, spending_frequency) VALUES ( '019c64e6-c200-7000-b000-000000000001', $1, '019c64e6-b300-7000-b000-000000000001', 50000, 'usd', 'monthly' ) ON CONFLICT (id) DO UPDATE SET individual_id = EXCLUDED.individual_id, spending_category_id = EXCLUDED.spending_category_id, amount_minor_units = EXCLUDED.amount_minor_units, currency_code = EXCLUDED.currency_code, spending_frequency = EXCLUDED.spending_frequency`,
    [testIndividualId],
  )
  await query(
    `INSERT INTO individual_rewards_program_statuses (id, individual_id, rewards_program_status_id) VALUES ( '019c64e6-c300-7000-b000-000000000001', $1, '019c64e6-b200-7000-b000-000000000001' ) ON CONFLICT (id) DO UPDATE SET individual_id = EXCLUDED.individual_id, rewards_program_status_id = EXCLUDED.rewards_program_status_id`,
    [testIndividualId],
  )
  await query(
    `INSERT INTO individual_rewards_program_point_valuations (id, individual_id, rewards_program_id, value_microunits_per_point, currency_code) VALUES ( '019c64e6-c400-7000-b000-000000000001', $1, '019c64e6-b100-7000-b000-000000000001', 20000, 'usd' ) ON CONFLICT (id) DO UPDATE SET individual_id = EXCLUDED.individual_id, rewards_program_id = EXCLUDED.rewards_program_id, value_microunits_per_point = EXCLUDED.value_microunits_per_point, currency_code = EXCLUDED.currency_code`,
    [testIndividualId],
  )
  await query(
    `INSERT INTO agent_prompts (id, agent_id, prompt, model_name, model_provider, activated_at) VALUES ( '019d0000-0000-7000-8000-000000000010', '019d0000-0000-7000-8000-000000000002', 'Moderate this post for self-promotion.', 'gpt-5.4-nano', 'openai', CURRENT_TIMESTAMP ) ON CONFLICT (id) DO NOTHING`,
  )
  await query(
    `INSERT INTO agent_moderations (post_id, input_sha256, prompt_id, agent_id, results, flagged) VALUES ( '019c64e6-f720-7001-a001-000000000001', decode('0000000000000000000000000000000000000000000000000000000000000004', 'hex'), '019d0000-0000-7000-8000-000000000010', '019d0000-0000-7000-8000-000000000002', '{"flagged": false, "reason": "Normal discussion post"}'::jsonb, false ), ( '019c64e6-f720-7002-a002-000000000001', decode('0000000000000000000000000000000000000000000000000000000000000007', 'hex'), '019d0000-0000-7000-8000-000000000010', '019d0000-0000-7000-8000-000000000002', '{"flagged": true, "reason": "Possible self-promotion detected"}'::jsonb, true ), ( '019c64e6-f730-7001-8001-000000000001', decode('000000000000000000000000000000000000000000000000000000000000000a', 'hex'), '019d0000-0000-7000-8000-000000000010', '019d0000-0000-7000-8000-000000000002', '{"flagged": false, "reason": "Normal comment"}'::jsonb, false ) ON CONFLICT DO NOTHING`,
  )
}

export { seedPlaywrightRewardsProfile }
