import type { TransactionQuery } from '@data-stores/psql'

export const SEEDED_CONVERSATION_ID = '019e0000-0000-7000-8000-000000000001'
export const SEEDED_SECOND_PAGE_CONVERSATION_ID = '019e0000-0000-7000-8000-000000000104'
export const SEEDED_SECOND_PAGE_CONVERSATION_TITLE = 'Playwright Sidebar Page 2 Conversation'

const SIDEBAR_PAGINATION_CONVERSATIONS = [
  ['019e0000-0000-7000-8000-000000000100', 'Playwright Sidebar Conversation 100'],
  ['019e0000-0000-7000-8000-000000000101', 'Playwright Sidebar Conversation 101'],
  ['019e0000-0000-7000-8000-000000000102', 'Playwright Sidebar Conversation 102'],
  ['019e0000-0000-7000-8000-000000000103', 'Playwright Sidebar Conversation 103'],
  [SEEDED_SECOND_PAGE_CONVERSATION_ID, SEEDED_SECOND_PAGE_CONVERSATION_TITLE],
  ['019e0000-0000-7000-8000-000000000105', 'Playwright Sidebar Conversation 105'],
  ['019e0000-0000-7000-8000-000000000106', 'Playwright Sidebar Conversation 106'],
  ['019e0000-0000-7000-8000-000000000107', 'Playwright Sidebar Conversation 107'],
  ['019e0000-0000-7000-8000-000000000108', 'Playwright Sidebar Conversation 108'],
  ['019e0000-0000-7000-8000-000000000109', 'Playwright Sidebar Conversation 109'],
  ['019e0000-0000-7000-8000-000000000110', 'Playwright Sidebar Conversation 110'],
  ['019e0000-0000-7000-8000-000000000111', 'Playwright Sidebar Conversation 111'],
  ['019e0000-0000-7000-8000-000000000112', 'Playwright Sidebar Conversation 112'],
  ['019e0000-0000-7000-8000-000000000113', 'Playwright Sidebar Conversation 113'],
  ['019e0000-0000-7000-8000-000000000114', 'Playwright Sidebar Conversation 114'],
  ['019e0000-0000-7000-8000-000000000115', 'Playwright Sidebar Conversation 115'],
  ['019e0000-0000-7000-8000-000000000116', 'Playwright Sidebar Conversation 116'],
  ['019e0000-0000-7000-8000-000000000117', 'Playwright Sidebar Conversation 117'],
  ['019e0000-0000-7000-8000-000000000118', 'Playwright Sidebar Conversation 118'],
  ['019e0000-0000-7000-8000-000000000119', 'Playwright Sidebar Conversation 119'],
  ['019e0000-0000-7000-8000-000000000120', 'Playwright Sidebar Conversation 120'],
  ['019e0000-0000-7000-8000-000000000121', 'Playwright Sidebar Conversation 121'],
  ['019e0000-0000-7000-8000-000000000122', 'Playwright Sidebar Conversation 122'],
  ['019e0000-0000-7000-8000-000000000123', 'Playwright Sidebar Conversation 123'],
  ['019e0000-0000-7000-8000-000000000124', 'Playwright Sidebar Conversation 124'],
] as const

export async function seedPlaywrightConversations(query: TransactionQuery): Promise<void> {
  await query(
    `INSERT INTO conversations (id, created_by_id, title) VALUES ( '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', 'Chat Feature Test Conversation' ) ON CONFLICT (id) DO UPDATE SET created_by_id = EXCLUDED.created_by_id, title = EXCLUDED.title`,
  )
  await query(
    `/* seedPlaywrightSidebarPaginationConversations */ INSERT INTO conversations (id, created_by_id, title) SELECT seed.id::uuid, '019f0000-0000-7000-8000-000000000000'::uuid, seed.title FROM UNNEST($1::text[], $2::text[]) AS seed(id, title) ON CONFLICT (id) DO UPDATE SET created_by_id = EXCLUDED.created_by_id, title = EXCLUDED.title`,
    [
      SIDEBAR_PAGINATION_CONVERSATIONS.map(([id]) => id),
      SIDEBAR_PAGINATION_CONVERSATIONS.map(([, title]) => title),
    ],
  )
  await query(
    `INSERT INTO conversation_messages (id, conversation_id, created_by_id, content) VALUES
      ( '019e0000-0000-7000-8000-000000000002', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "user", "content": "What credit cards have the best travel rewards?"}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000003', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "assistant", "content": "Great question! The top travel rewards cards generally fall into a few categories. Premium cards like the Chase Sapphire Reserve and Amex Platinum offer strong earning rates on travel and dining, plus valuable perks like lounge access and travel credits. Mid-tier cards like the Chase Sapphire Preferred and Capital One Venture Rewards offer solid value with lower annual fees. The best card for you depends on your spending patterns, preferred airlines and hotels, and how much you value perks versus a lower annual fee. Would you like me to compare specific cards?"}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000004', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "user", "content": "Tell me more about the Chase Sapphire Reserve."}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000005', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "assistant", "content": "The Chase Sapphire Reserve earns 3x points on travel and dining worldwide."}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000006', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "user", "content": "Does it have an annual fee?"}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000007', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "assistant", "content": "Yes, the Chase Sapphire Reserve has a $550 annual fee, offset by a $300 travel credit."}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000008', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "user", "content": "How does it compare to the Amex Platinum?"}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000009', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "assistant", "content": "Both are premium cards. The Amex Platinum has a higher $695 annual fee but offers more credits and lounge access."}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000010', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "user", "content": "Which one would you recommend for frequent flyers?"}'::jsonb ),
      ( '019e0000-0000-7000-8000-000000000011', '${SEEDED_CONVERSATION_ID}', '019f0000-0000-7000-8000-000000000000', '{"role": "assistant", "content": "For frequent flyers, the Amex Platinum is often the better choice due to its extensive lounge access network."}'::jsonb )
    ON CONFLICT (conversation_id, id) DO NOTHING`,
  )
}
