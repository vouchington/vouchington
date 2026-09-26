import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts } from './helpers.mts'

async function seedPlaywrightAgentAndComments(query: TransactionQuery): Promise<void> {
  await query(
    `INSERT INTO users (id, username) VALUES ('019d0000-0000-7000-8000-000000000001', 'test-reviewer') ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
  )
  await query(
    `INSERT INTO agents (id, system_user_id, agent_type, activated_at) VALUES ( '019d0000-0000-7000-8000-000000000002', '019d0000-0000-7000-8000-000000000001', 'moderator', CURRENT_TIMESTAMP ) ON CONFLICT (id) DO NOTHING`,
  )
  await query(
    `INSERT INTO agents__moderators (agent_id, slug) VALUES ('019d0000-0000-7000-8000-000000000002', 'test-reviewer') ON CONFLICT (agent_id) DO UPDATE SET slug = EXCLUDED.slug`,
  )
  await query(
    `INSERT INTO conversations (id, created_by_id, title) VALUES ( '019d0000-0000-7000-8000-000000000003', '019f0000-0000-7000-8000-000000000000', 'Test Agent Conversation' ) ON CONFLICT (id) DO UPDATE SET created_by_id = EXCLUDED.created_by_id, title = EXCLUDED.title`,
  )
  await query(
    `INSERT INTO conversation_messages (id, conversation_id, created_by_id, content) VALUES ( '019d0000-0000-7000-8000-000000000004', '019d0000-0000-7000-8000-000000000003', '019f0000-0000-7000-8000-000000000000', '{"role": "user", "content": "What should I look for in a travel card?"}'::jsonb ), ( '019d0000-0000-7000-8000-000000000005', '019d0000-0000-7000-8000-000000000003', '019d0000-0000-7000-8000-000000000001', '{"role": "assistant", "content": "When choosing a travel card, consider annual fees, earning rates on travel purchases, and transfer partners."}'::jsonb ) ON CONFLICT DO NOTHING`,
  )
  await query(
    `INSERT INTO support_contacts (id, email_address, user_id, name) VALUES ( '019d0000-0000-7000-8000-000000000006', 'agent-test@playwright.seed', '019f0000-0000-7000-8000-000000000000', 'Playwright Test Contact' ) ON CONFLICT (email_address) DO UPDATE SET user_id = EXCLUDED.user_id`,
  )
  await query(
    `INSERT INTO support_threads (id, support_contact_id, conversation_id, subject) VALUES ( '019d0000-0000-7000-8000-000000000007', '019d0000-0000-7000-8000-000000000006', '019d0000-0000-7000-8000-000000000003', 'Test Agent Support Thread' ) ON CONFLICT (id) DO NOTHING`,
  )
  await query(
    `INSERT INTO posts ( id, post_type, parent_id, root_id, created_by_id, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256, created_via ) VALUES ( '019c64e6-f730-7001-8001-000000000001', 'comment', '019c64e6-f720-7001-a001-000000000001', '019c64e6-f720-7001-a001-000000000001', '019f0000-0000-7000-8000-000000000000', 'This is Comment A - a top-level comment', decode('00000000000000000000000000000000000000000000000000000000000000f1', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f1', 'hex'), 'system' ), ( '019c64e6-f730-7001-8001-000000000002', 'comment', '019c64e6-f730-7001-8001-000000000001', '019c64e6-f720-7001-a001-000000000001', '019f0000-0000-7000-8000-000000000000', 'This is Reply B - a reply to Comment A', decode('00000000000000000000000000000000000000000000000000000000000000f2', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f2', 'hex'), 'system' ), ( '019c64e6-f730-7001-8001-000000000003', 'comment', '019c64e6-f730-7001-8001-000000000002', '019c64e6-f720-7001-a001-000000000001', '019f0000-0000-7000-8000-000000000000', 'This is Reply D - a nested reply', decode('00000000000000000000000000000000000000000000000000000000000000f3', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f3', 'hex'), 'system' ), ( '019c64e6-f730-7001-8001-000000000004', 'comment', '019c64e6-f730-7001-8001-000000000001', '019c64e6-f720-7001-a001-000000000001', '019f0000-0000-7000-8000-000000000000', 'This is Reply C - another reply to Comment A', decode('00000000000000000000000000000000000000000000000000000000000000f4', 'hex'), decode('00000000000000000000000000000000000000000000000000000000000000f4', 'hex'), 'system' ) ON CONFLICT (id) DO NOTHING`,
  )
  await approveSeedPosts(query, [
    '019c64e6-f730-7001-8001-000000000001',
    '019c64e6-f730-7001-8001-000000000002',
    '019c64e6-f730-7001-8001-000000000003',
    '019c64e6-f730-7001-8001-000000000004',
  ])
}

export { seedPlaywrightAgentAndComments }
