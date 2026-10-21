import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { checkTestApiKeyReminderAtOffset } from '@voucha/test-helpers/entities/api-key-reminder-boundary'
import { createApiKey } from './create.mts'

describe('API key reminder PostgreSQL cutoffs', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'synthetic API key checksum secret for reminder tests'
  })

  it.each([
    ['now', -1, false],
    ['now', 0, false],
    ['now', 1, true],
    ['seven-days', -1, true],
    ['seven-days', 0, true],
    ['seven-days', 1, false],
  ] as const)('%s offset %i ms is eligible: %s', async (edge, offsetMs, eligible) => {
    const owner = await createTestUser()
    const { apiKey } = await createApiKey(owner.id, 'rss', 'Reminder cutoff', ['rss:read'])
    const result = await checkTestApiKeyReminderAtOffset(apiKey.id, edge, offsetMs)
    expect(result).toEqual({
      due: eligible,
      details: eligible,
      claimed: eligible,
      claimedAgain: false,
    })
  })
})
