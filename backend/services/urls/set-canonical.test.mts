import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUrlWithHostname } from '@voucha/test-helpers'
import {
  getTestUrlCanonicalId,
  hardDeleteTestUrl,
  insertTestUrl,
} from '@voucha/test-helpers/entities/urls'
import { setCanonicalUrlDuringConcurrentTargetRewriteForTest } from '@voucha/test-helpers/url-canonical-races'
import { getUrlById } from './get.mts'
import { CircularCanonicalReferenceError, setCanonicalUrl } from './set-canonical.mts'
import { canonicalWorkConfig } from './canonical-work-limits.mts'

describe('concurrent canonical URL rewrites', () => {
  let restore: () => void
  beforeAll(async () => hackerNewsQueueConfig.waitForInitialization())
  beforeEach(() => {
    restore = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: false })
  })
  afterEach(() => restore())

  it('commits a canonical rewrite when configured for one attempt', async () => {
    await canonicalWorkConfig.waitForInitialization()
    const restoreAttempts = overrideDynamicConfigFieldsForTest(canonicalWorkConfig, {
      rewrite_attempts: 1,
    })
    try {
      const [source, terminal] = await Promise.all([
        createTestUrlWithHostname(),
        createTestUrlWithHostname(),
      ])
      expect(await setCanonicalUrl(source, terminal)).toBe(terminal)
      expect(await getTestUrlCanonicalId(source)).toBe(terminal)
    } finally {
      restoreAttempts()
    }
  })

  it('keeps references on terminal roots under overlapping rewrites', async () => {
    const [a, b, c, d] = await Promise.all(
      Array.from({ length: 4 }, () => createTestUrlWithHostname()),
    )
    await Promise.all([setCanonicalUrl(a!, b!), setCanonicalUrl(b!, c!), setCanonicalUrl(c!, d!)])
    const one = await getTestUrlCanonicalId(a!)
    expect(one && (await getTestUrlCanonicalId(one))).toBeNull()
  })

  it('does not allow concurrent inverse rewrites to form a cycle', async () => {
    const [a, b] = await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    const results = await Promise.allSettled([setCanonicalUrl(a, b), setCanonicalUrl(b, a)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: expect.any(CircularCanonicalReferenceError),
    })
  })

  it('rejects an inverse rewrite when the target changes after root resolution', async () => {
    const [a, b] = await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    await expect(
      setCanonicalUrlDuringConcurrentTargetRewriteForTest(b, a, a, b),
    ).rejects.toBeInstanceOf(CircularCanonicalReferenceError)

    expect(await getTestUrlCanonicalId(a)).toBe(b)
    expect(await getTestUrlCanonicalId(b)).toBeNull()
  })

  it('rejects an alias pointing to another alias at the foreign key boundary', async () => {
    const [source, terminal] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await setCanonicalUrl(source, terminal)
    const alias = await getUrlById(source, { readOnly: false })
    if (!alias) throw new Error('Expected alias fixture')

    await expect(
      insertTestUrl({
        url: `https://${alias.hostname.hostname}/alias-${crypto.randomUUID()}`,
        hostnameId: alias.hostname.id,
        canonicalUrlId: source,
      }),
    ).rejects.toMatchObject({ code: '23503', constraint: 'fk_urls__canonical_root' })
  })

  it('clears aliases when their terminal URL is deleted', async () => {
    const [alias, terminal] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await setCanonicalUrl(alias, terminal)
    await hardDeleteTestUrl(terminal)
    expect(await getTestUrlCanonicalId(alias)).toBeNull()
  })
})
