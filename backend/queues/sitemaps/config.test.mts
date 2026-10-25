import { describe, expect, it } from 'vitest'
import { SITEMAPS_ORDERING } from './config.mts'

describe('sitemaps lanes', () => {
  it('keeps each file-writing lane distinct and domain-prefixed', () => {
    const lanes = Object.values(SITEMAPS_ORDERING)
    expect(new Set(lanes.map(lane => lane.key)).size).toBe(lanes.length)
    for (const lane of lanes) expect(lane.key.startsWith('sitemaps:')).toBe(true)
  })
})
