import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUrlWithHostname } from '@voucha/test-helpers'
import { getTestUrlCanonicalId } from '@voucha/test-helpers/entities/urls'
import { setCanonicalUrl } from './set-canonical.mts'

describe('concurrent canonical URL rewrites', () => {
  let restore: () => void
  beforeAll(async () => hackerNewsQueueConfig.waitForInitialization())
  beforeEach(() => {
    restore = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: false })
  })
  afterEach(() => restore())

  it('keeps references within two hops under overlapping rewrites', async () => {
    const [a, b, c, d] = await Promise.all(
      Array.from({ length: 4 }, () => createTestUrlWithHostname()),
    )
    await Promise.all([setCanonicalUrl(a!, b!), setCanonicalUrl(b!, c!), setCanonicalUrl(c!, d!)])
    const one = await getTestUrlCanonicalId(a!)
    const two = one && (await getTestUrlCanonicalId(one))
    expect(two && (await getTestUrlCanonicalId(two))).toBeFalsy()
  })

  it('does not allow concurrent inverse rewrites to form a cycle', async () => {
    const [a, b] = await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    const results = await Promise.allSettled([setCanonicalUrl(a, b), setCanonicalUrl(b, a)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
})
