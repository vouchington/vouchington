import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  countBlacklistEntriesBySource,
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestBlacklistMembershipDiffAppliedAt,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'
import { getSourceCacheHeaders } from '@services/urls-domains-blacklist/sources'
import { BLOCKLIST_DIFF_DIRECTORY_PREFIX, syncDomainsWithDatabase } from './sync-db.mts'
import { ReplicaBehindError } from './replica-freshness.mts'
import { persistDomainDiff } from './sync-db-domain-diff.mts'

describe('blocklist membership apply', () => {
  it('refuses a stale replica version on the connection that would copy membership', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const name = `stale-snapshot-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/stale-snapshot.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    let readOnCopyClient = false
    const before = new Set(diffDirectories())
    try {
      await expect(
        syncDomainsWithDatabase(
          sourceId,
          new Response(`stale-${suffix}.example\n`),
          'url',
          undefined,
          {
            readReplicaSourceVersion: async (client, _sourceId, writerVersion) => {
              readOnCopyClient = typeof client.query === 'function'
              return precedingSourceVersion(writerVersion)
            },
          },
        ),
      ).rejects.toBeInstanceOf(ReplicaBehindError)
      expect(readOnCopyClient).toBe(true)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

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
        undefined,
        { cacheHeaders: { etag: '"list-v2"', lastModifiedAt } },
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

  it('leaves the source unchanged when comm fails', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const name = `comm-fail-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/comm-fail.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    const before = new Set(diffDirectories())
    try {
      await expect(
        syncDomainsWithDatabase(
          sourceId,
          new Response(`added-${suffix}.example\n`),
          'url',
          undefined,
          {
            writeCommDiff: async () => {
              throw new Error('comm failed')
            },
          },
        ),
      ).rejects.toThrow('comm failed')
      expect(await countBlacklistEntriesBySource(sourceId)).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('rolls back membership writes when persisting the diff fails', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const name = `persist-fail-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/persist-fail.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    const before = new Set(diffDirectories())
    try {
      await expect(
        syncDomainsWithDatabase(
          sourceId,
          new Response(`added-${suffix}.example\n`),
          'url',
          undefined,
          {
            cacheHeaders: { etag: '"should-roll-back"', lastModifiedAt: null },
            persistDomainDiff: async (query, id, sourceType) => {
              await persistDomainDiff(query, id, sourceType)
              throw new Error('persist failed')
            },
          },
        ),
      ).rejects.toThrow('persist failed')
      expect(await countBlacklistEntriesBySource(sourceId)).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      await expect(getSourceCacheHeaders(sourceId)).resolves.toMatchObject({ etag: null })
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})

function precedingSourceVersion(version: string | null): string {
  if (version === null) return '2'
  const previous = (BigInt(version) - 1n) & 0xffffffffn
  return previous === 0n ? '4294967295' : previous.toString()
}

function diffDirectories(): string[] {
  return readdirSync(tmpdir()).filter(name => name.startsWith(BLOCKLIST_DIFF_DIRECTORY_PREFIX))
}

function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}
