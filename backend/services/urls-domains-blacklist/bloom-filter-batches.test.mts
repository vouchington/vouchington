import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import {
  createTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers/entities/domain-blacklists'
import { urlBlocklistBatchesFromDb } from './bloom-filter-batches.mts'

describe('hostname Bloom batches', () => {
  it('emits each owned blocked or uncrawlable hostname exactly once, including overlap', async () => {
    const suffix = randomUUID()
    const flags = [
      { is_crawlable: true, is_blocked: false },
      { is_crawlable: false, is_blocked: false },
      { is_crawlable: true, is_blocked: true },
      { is_crawlable: false, is_blocked: true },
    ]
    const hostnames = flags.map((_, i) => `bloom-flags-${i}-${suffix}.example.com`)
    for (const [i, flag] of flags.entries())
      await insertTestUrlHostname({ hostname: hostnames[i]!, ...flag })
    const found: string[] = []
    for await (const batch of urlBlocklistBatchesFromDb())
      found.push(...batch.filter(hostname => hostnames.includes(hostname)))
    expect(found.toSorted()).toEqual(hostnames.slice(1).toSorted())
  })

  it('emits a projected URL-feed domain from the source and excludes an email-feed-only domain', async () => {
    const suffix = randomUUID()
    const sourceSuffix = Array.from(suffix.replaceAll('-', ''), character =>
      String.fromCharCode(97 + Number.parseInt(character, 16)),
    ).join('')
    const urlHostname = `bloom-url-${suffix}.example.com`
    const emailHostname = `bloom-email-${suffix}.example.com`
    await insertTestDomainBlacklist(urlHostname, `bloom-url-source-${sourceSuffix}`)
    const emailSourceName = `bloom-email-source-${sourceSuffix}`
    await createTestBlacklistSource({
      type: 'email',
      name: emailSourceName,
      url: `https://example.com/${suffix}/email`,
    })
    await insertTestDomainBlacklist(emailHostname, emailSourceName)

    const found: string[] = []
    for await (const batch of urlBlocklistBatchesFromDb())
      found.push(
        ...batch.filter(hostname => hostname === urlHostname || hostname === emailHostname),
      )
    expect(found).toEqual([urlHostname])
  })
})
