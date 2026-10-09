import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { checkDomainBlacklisted } from './check-domain-blacklisted.mts'

describe('hostname blocklist flags', () => {
  it.each([
    { is_crawlable: false, is_blocked: false },
    { is_crawlable: true, is_blocked: true },
    { is_crawlable: false, is_blocked: true },
  ])('blocks a hostname with flags $is_crawlable/$is_blocked', async flags => {
    const hostname = `flag-blocklist-${randomUUID()}.example.com`
    await insertTestUrlHostname({ hostname, ...flags })
    await expect(checkDomainBlacklisted(hostname)).resolves.toBe(true)
  })
  it('allows the schema-default flags', async () => {
    const hostname = `flag-allowed-${randomUUID()}.example.com`
    await insertTestUrlHostname({ hostname })
    await expect(checkDomainBlacklisted(hostname)).resolves.toBe(false)
  })
})
