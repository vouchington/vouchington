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
import { resolveEmailDomainHostnameId } from '../../email-address-validator/email-domain-context.mts'
import { getUrlHostnameById } from '@services/urls-hostnames/get'
import { syncDomainsWithDatabase } from '../../urls-domains-blacklist-sync/sync-db.mts'
import { invalidateSourceHostnameCaches } from '../source-cache.mts'
import { blocklistBloomReadyKey } from '../ready-marker.mts'

describe('blacklist source cache invalidation', () => {
  it('uses a new Bloom readiness key when the configured source type changes', () => {
    const email = [{ name: 'example', type: 'email' }] as const
    const url = [{ name: 'example', type: 'url' }] as const
    for (const filter of ['email-blocklist', 'url-blocklist'] as const) {
      expect(blocklistBloomReadyKey(filter, email)).not.toBe(blocklistBloomReadyKey(filter, url))
    }
  })

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
      await caches.email_domain_validation.set(domain, { success: true })

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
      expect(await caches.email_domain_validation.get(domain)).toBeNull()
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('permanently introduces an email-only domain when its source becomes a URL feed', async () => {
    const suffix = randomUUID()
    const domain = `source-introduction-${suffix}.example.com`
    const name = `source-introduction-${Array.from(suffix.replaceAll('-', ''), digit =>
      String.fromCodePoint(97 + Number.parseInt(digit, 16)),
    ).join('')}`
    const hostnameId = await resolveEmailDomainHostnameId(`reader@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const sourceId = await createTestBlacklistSource({
      type: 'email',
      name,
      url: 'https://example.com/source-introduction.txt',
    })
    try {
      await syncDomainsWithDatabase(sourceId, new Response(`${domain}\n`), 'email')
      expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toBeNull()
      await createTestBlacklistSource({
        type: 'url',
        name,
        url: 'https://example.com/source-introduction.txt',
      })
      const introducedAt = (await getUrlHostnameById(hostnameId))?.publicly_introduced_at
      expect(introducedAt).toBeInstanceOf(Date)
      await createTestBlacklistSource({
        type: 'email',
        name,
        url: 'https://example.com/source-introduction.txt',
      })
      expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toEqual(introducedAt)
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})
