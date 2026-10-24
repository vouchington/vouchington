import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestBlacklistSource, deleteTestBlacklistSource } from '@voucha/test-helpers'
import { resolveEmailDomainHostnameId } from '../../email-address-validator/email-domain-context.mts'
import { getUrlHostnameById } from '@services/urls-hostnames/get'
import { syncDomainsWithDatabase } from '../../urls-domains-blacklist-sync/sync-db.mts'
import { blocklistBloomReadyKey } from '../ready-marker.mts'

describe('blacklist source cache invalidation', () => {
  it('uses a new Bloom readiness key when the configured source type changes', () => {
    const email = [{ name: 'example', type: 'email' }] as const
    const url = [{ name: 'example', type: 'url' }] as const
    for (const filter of ['email-blocklist', 'url-blocklist'] as const) {
      expect(blocklistBloomReadyKey(filter, email)).not.toBe(blocklistBloomReadyKey(filter, url))
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
