import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import * as bloomEnqueues from '@queues/bloom-filters/enqueues'
import { getSourceCacheHeaders } from '@services/urls-domains-blacklist/sources'
import {
  countBlacklistEntriesBySource,
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestBlacklistMembershipDiffAppliedAt,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'
import * as diffFiles from './diff-files.mts'
import * as domainDiff from './sync-db-domain-diff.mts'
import * as replicaSourceVersion from './replica-source-version.mts'
import { ReplicaBehindError } from './replica-freshness.mts'
import { BLOCKLIST_DIFF_DIRECTORY_PREFIX, syncDomainsWithDatabase } from './sync-db.mts'

const readReplicaSourceVersion = replicaSourceVersion.readReplicaSourceVersionFromClient
const persistDomainDiff = domainDiff.persistDomainDiff

describe('blocklist membership faults', () => {
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
    const before = new Set(diffDirectories())
    let sawCopyClient = false
    const version = vi
      .spyOn(replicaSourceVersion, 'readReplicaSourceVersionFromClient')
      .mockImplementation(async (client, sourceIdForCopy) => {
        sawCopyClient = typeof client.query === 'function'
        const current = await readReplicaSourceVersion(client, sourceIdForCopy)
        return precedingSourceVersion(current)
      })
    try {
      await expect(
        syncDomainsWithDatabase(sourceId, new Response(`stale-${suffix}.example\n`), 'url'),
      ).rejects.toBeInstanceOf(ReplicaBehindError)
      expect(sawCopyClient).toBe(true)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      version.mockRestore()
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
    const comm = vi.spyOn(diffFiles, 'writeCommDiff').mockImplementation(async () => {
      throw new Error('comm failed')
    })
    try {
      await expect(
        syncDomainsWithDatabase(sourceId, new Response(`added-${suffix}.example\n`), 'url'),
      ).rejects.toThrow('comm failed')
      expect(await countBlacklistEntriesBySource(sourceId)).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      comm.mockRestore()
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
    const persist = vi
      .spyOn(domainDiff, 'persistDomainDiff')
      .mockImplementation(async (query, id, sourceType) => {
        await persistDomainDiff(query, id, sourceType)
        throw new Error('persist failed')
      })
    try {
      await expect(
        syncDomainsWithDatabase(sourceId, new Response(`added-${suffix}.example\n`), 'url', {
          etag: '"should-roll-back"',
          lastModifiedAt: null,
        }),
      ).rejects.toThrow('persist failed')
      expect(await countBlacklistEntriesBySource(sourceId)).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      await expect(getSourceCacheHeaders(sourceId)).resolves.toMatchObject({ etag: null })
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      persist.mockRestore()
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('keeps the committed diff unpublished when the bloom rebuild is not queued', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const added = `added-${suffix}.example`
    const name = `bloom-fail-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/bloom-fail.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    const before = new Set(diffDirectories())
    const enqueue = vi.spyOn(bloomEnqueues, 'enqueueRebuildBloomFilter').mockImplementation(() => {
      throw new Error('bloom enqueue failed')
    })
    try {
      await expect(
        syncDomainsWithDatabase(sourceId, new Response(`${kept}\n${added}\n`), 'url', {
          etag: '"should-not-stick"',
          lastModifiedAt: null,
        }),
      ).rejects.toThrow('bloom enqueue failed')
      expect(enqueue).toHaveBeenCalled()
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual(
        [added, kept].toSorted(),
      )
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      await expect(getSourceCacheHeaders(sourceId)).resolves.toMatchObject({ etag: null })
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      enqueue.mockRestore()
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
