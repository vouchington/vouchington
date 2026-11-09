import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUrlWithHostname } from '@voucha/test-helpers'
import {
  getTestUrlCanonicalId,
  hardDeleteTestUrl,
  insertTestUrl,
} from '@voucha/test-helpers/entities/urls'
import { getUrlById } from './get.mts'
import { CircularCanonicalReferenceError, setCanonicalUrl } from './set-canonical.mts'

describe('concurrent canonical URL rewrites', () => {
  let restore: () => void
  beforeAll(async () => hackerNewsQueueConfig.waitForInitialization())
  beforeEach(() => {
    restore = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: false })
  })
  afterEach(() => restore())

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
