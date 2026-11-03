import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'
import { getSourceCacheHeaders } from '@services/urls-domains-blacklist/sources'
import { syncDomainsWithDatabase } from './sync-db.mts'

describe('sync-db empty feed', () => {
  it.each(['', '<html><body>Service unavailable</body></html>\n', '# only a comment\n'])(
    'rejects a feed with no valid domains and keeps the existing domains',
    async feed => {
      const suffix = crypto.randomUUID().replaceAll(/[0-9-]/g, 'a')
      const name = `sync-db-empty-${suffix}`
      const sourceId = await createTestBlacklistSource({
        type: 'url',
        name,
        url: 'https://example.com/empty-feed.txt',
      })
      try {
        await insertTestDomainBlacklist(`kept-${suffix}.com`, name)
        await expect(syncDomainsWithDatabase(sourceId, new Response(feed), 'url')).rejects.toThrow(
          'no valid domains',
        )
        await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([
          `kept-${suffix}.com`,
        ])
        expect(await getSourceCacheHeaders(sourceId)).toMatchObject({
          etag: null,
          membership_diff_applied_at: null,
        })
      } finally {
        await deleteTestBlacklistSource(sourceId)
      }
    },
  )
})
