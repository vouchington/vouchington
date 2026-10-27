import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestBlacklistMembershipDiffAppliedAt,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'
import { getSourceCacheHeaders } from '@services/urls-domains-blacklist/sources'
import { syncDomainsWithDatabase } from './sync-db.mts'

describe('blocklist membership apply', () => {
  it('counts domainsAdded from the rows the insert actually returns', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const added = `added-${suffix}.example`
    const name = `added-count-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/added-count.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    const lastModifiedAt = new Date('2025-01-01T00:00:00.000Z')
    try {
      const result = await syncDomainsWithDatabase(
        sourceId,
        new Response(`${kept}\n${added}\n`),
        'url',
        {
          etag: '"list-v2"',
          lastModifiedAt,
        },
      )
      expect(result.domainsAdded).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual(
        [added, kept].toSorted(),
      )
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeInstanceOf(Date)
      await expect(getSourceCacheHeaders(sourceId)).resolves.toMatchObject({
        etag: '"list-v2"',
        last_modified_at: lastModifiedAt,
      })
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})

function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}
