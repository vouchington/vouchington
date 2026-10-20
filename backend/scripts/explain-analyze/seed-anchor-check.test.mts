import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assertSeedAnchorMatches } from './seed-anchor-check.mts'

describe('assertSeedAnchorMatches', () => {
  it('rejects a seed anchor post id absent from the database', async () => {
    const missingPostId = randomUUID()
    await expect(assertSeedAnchorMatches(missingPostId)).rejects.toThrow(
      `Seed anchor post ${missingPostId} not found`,
    )
  })
})
