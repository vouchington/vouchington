import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getHostnamePoliciesFromLocal } from '../domains.mts'

function sourceNameSuffix(): string {
  return Array.from(randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}

describe('hostname policy completion from local rows', () => {
  const sourceIds: Array<Parameters<typeof deleteTestBlacklistSource>[0]> = []

  afterEach(async () => {
    for (const sourceId of sourceIds.splice(0)) await deleteTestBlacklistSource(sourceId)
  })

  async function ownBlocklistedDomain(domain: string): Promise<void> {
    const name = `hostname-pre-read-${sourceNameSuffix()}`
    sourceIds.push(
      await createTestBlacklistSource({ type: 'url', name, url: 'https://example.com' }),
    )
    await insertTestDomainBlacklist(domain, name)
  }

  it('uses the authoritative full read when Bloom is disabled', async () => {
    const domain = `pre-read-full-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    const restore = overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
      urlBlocklistBloomFilterEnabled: false,
    })
    try {
      const result = await getHostnamePoliciesFromLocal(
        [domain],
        new Map([[domain, { is_blocked: false, should_skip_web_risk: false }]]),
      )
      expect(result.get(domain)?.is_blocked).toBe(true)
    } finally {
      restore()
    }
  })
})
