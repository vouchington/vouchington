import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestHostnameRow,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getUrlHostnameByAnyCached } from '../../entity-fetch/get.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { invalidateSourceHostnameCaches } from '../source-cache.mts'

describe('blacklist source cache invalidation', () => {
  it('evicts a hostname after its source changes from URL to email without a domain diff', async () => {
    const suffix = randomUUID()
    const domain = `source-cache-${suffix}.example.com`
    const name = `source-cache-${Array.from(suffix.replaceAll('-', ''), digit =>
      String.fromCodePoint(97 + Number.parseInt(digit, 16)),
    ).join('')}`
    const hostnameId = (await upsertUrlHostnames(null, [domain])).get(domain)!
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/source-cache.txt',
    })
    try {
      await insertTestDomainBlacklist(domain, name)
      const blocked = await getUrlHostnameByAnyCached(hostnameId)
      expect(blocked?.is_blocked).toBe(true)
      await caches.url_hostnames.set(hostnameId, blocked)
      await caches.url_hostnames.set(domain, blocked)

      await createTestBlacklistSource({
        type: 'email',
        name,
        url: 'https://example.com/source-cache.txt',
      })
      expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(false)
      expect((await getUrlHostnameByAnyCached(hostnameId))?.is_blocked).toBe(true)

      await invalidateSourceHostnameCaches([sourceId])
      for (const key of [hostnameId, domain]) {
        expect((await getUrlHostnameByAnyCached(key))?.is_blocked).toBe(false)
      }
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})
