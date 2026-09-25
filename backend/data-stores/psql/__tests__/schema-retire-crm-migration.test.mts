import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  new URL('../migrations/0721-00-00-retire-crm.sql', import.meta.url),
  'utf8',
)

describe('CRM retirement migration', () => {
  it('limits conversation-message deletion to CRM channels before retiring CRM senders', () => {
    expect(migrationSql).toContain(`DELETE FROM conversation_messages
USING conversations
WHERE conversation_messages.conversation_id = conversations.id
  AND conversations.channel_type = 'crm';`)
    expect(migrationSql).not.toMatch(/DELETE FROM conversation_messages\s+WHERE\s+crm_contact_id/u)
    expect(migrationSql.indexOf("conversations.channel_type = 'crm'")).toBeLessThan(
      migrationSql.indexOf('DROP COLUMN crm_contact_id'),
    )
  })
})
