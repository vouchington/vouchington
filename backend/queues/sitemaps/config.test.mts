import { describe, expect, it } from 'vitest'
import { SITEMAPS_DOMAIN } from '@queues/background/enqueues/sitemaps-jobs'
import { SITEMAPS_ORDERING } from './config.mts'

describe('sitemaps lanes', () => {
  it('declares a cap equal to the sum of its singleton lanes and the old worker concurrency bound', () => {
    const lanes = Object.values(SITEMAPS_ORDERING)
    const sum = lanes.reduce((total, lane) => total + lane.concurrency, 0)

    expect(SITEMAPS_DOMAIN.group).toEqual({ kind: 'lanes', cap: sum })
    expect(sum).toBeLessThanOrEqual(SITEMAPS_DOMAIN.workerConcurrency)
    expect(new Set(lanes.map(lane => lane.key)).size).toBe(lanes.length)
    for (const lane of lanes) expect(lane.key.startsWith('sitemaps:')).toBe(true)
  })
})
