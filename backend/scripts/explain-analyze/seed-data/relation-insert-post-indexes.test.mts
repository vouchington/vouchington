import { describe, expect, it } from 'vitest'
import { RELATION_INSERT_POST_INDEXES, postSeedTimestampMs, seedUuid } from './common.mts'

const ANCHOR_DAY_START_OFFSET_MS = 12 * 60 * 60 * 1000

function uuidTimestampMs(uuid: string): number {
  return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16)
}

describe('RELATION_INSERT_POST_INDEXES', () => {
  it('stamps both posts before the anchor UTC day so a clock uuidv7() sorts after them', () => {
    const startOfAnchorDay = postSeedTimestampMs(0) - ANCHOR_DAY_START_OFFSET_MS

    expect(RELATION_INSERT_POST_INDEXES).toHaveLength(2)
    for (const index of RELATION_INSERT_POST_INDEXES) {
      expect(uuidTimestampMs(seedUuid(index, '05'))).toBeLessThan(startOfAnchorDay)
    }
  })
})
