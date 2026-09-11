import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assertSeededSupportMessageCounts } from './support-message-counts.mts'

describe('assertSeededSupportMessageCounts', () => {
  it('checks both exact owned-thread counts', async () => {
    const missingThreadId = randomUUID()
    await expect(
      assertSeededSupportMessageCounts({
        target: { threadId: missingThreadId, count: 0 },
        distractor: { threadId: randomUUID(), count: 0 },
      }),
    ).resolves.toBeUndefined()
    await expect(
      assertSeededSupportMessageCounts({
        target: { threadId: missingThreadId, count: 1 },
        distractor: { threadId: randomUUID(), count: 0 },
      }),
    ).rejects.toThrow('Expected 1 seeded target support messages, found 0')
  })
})
