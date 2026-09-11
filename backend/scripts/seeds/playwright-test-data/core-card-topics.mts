import type { TransactionQuery } from '@data-stores/psql'

async function seedPlaywrightCardTopics(
  query: TransactionQuery,
  _testUserEmail: string,
): Promise<void> {
  await query(
    `DELETE FROM topic_aliases WHERE topic_id IN (SELECT id FROM topics WHERE slug IN ('chase-sapphire-preferred', 'american-express-gold', 'capital-one-venture', 'test-news-source', 'chase-sapphire-referral', 'chase-ultimate-rewards', 'chase-sapphire-preferred-status', 'groceries'))`,
  )
  await query(
    `DELETE FROM topics WHERE slug IN ('chase-sapphire-preferred', 'american-express-gold', 'capital-one-venture', 'test-news-source', 'chase-sapphire-referral', 'chase-ultimate-rewards', 'chase-sapphire-preferred-status', 'groceries')`,
  )
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, markdown, bedrock_nova_multimodal_v1_content_sha256) VALUES ( '019c64e6-f710-74cb-b36d-130af8ff1067', 'card', 'Chase Sapphire Preferred', 'chase-sapphire-preferred', 'Premium travel rewards credit card with 2X points on travel and dining', decode('0000000000000000000000000000000000000000000000000000000000000001', 'hex') ), ( '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1', 'card', 'American Express Gold', 'american-express-gold', 'Earn 4X points at restaurants and U.S. supermarkets', decode('0000000000000000000000000000000000000000000000000000000000000002', 'hex') ), ( '019c64e6-f716-722f-b05c-f4c4f7b93cd0', 'card', 'Capital One Venture', 'capital-one-venture', 'Earn unlimited 2X miles on every purchase', decode('0000000000000000000000000000000000000000000000000000000000000003', 'hex') ) ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id, topic_type = EXCLUDED.topic_type, name = EXCLUDED.name, markdown = EXCLUDED.markdown, bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
  await query(
    `INSERT INTO topics__cards (topic_id) VALUES ('019c64e6-f710-74cb-b36d-130af8ff1067'), ('019c64e6-f713-7bf3-8b1e-a869aa7c9cf1'), ('019c64e6-f716-722f-b05c-f4c4f7b93cd0') ON CONFLICT (topic_id) DO NOTHING`,
  )
}

export { seedPlaywrightCardTopics }
