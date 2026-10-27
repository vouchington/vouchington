import { readdirSync, writeFileSync } from 'node:fs'
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
import { BLOCKLIST_DIFF_DIRECTORY_PREFIX, syncDomainsWithDatabase } from './sync-db.mts'
import { ReplicaBehindError } from './replica-freshness.mts'
import { persistDomainDiff } from './sync-db-domain-diff.mts'

describe('blocklist membership apply', () => {
  it('refuses an injected stale membership snapshot before copying it', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const name = `stale-snapshot-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/stale-snapshot.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    let seenLsn: string | undefined
    let copied = false
    const before = new Set(diffDirectories())
    try {
      await expect(
        syncDomainsWithDatabase(
          sourceId,
          new Response(`stale-${suffix}.example\n`),
          'url',
          undefined,
          {
            writerLsn: '0/20',
            replicaCoversWriterLsn: async writerLsn => {
              seenLsn = writerLsn
              return false
            },
            copySourceMembership: async (_sourceId, destination) => {
              copied = true
              writeFileSync(destination, `stale-${suffix}.example\n`)
            },
          },
        ),
      ).rejects.toBeInstanceOf(ReplicaBehindError)
      expect(seenLsn).toBe('0/20')
      expect(copied).toBe(false)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeNull()
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('applies an injected snapshot when the replica check is omitted', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const added = `added-${suffix}.example`
    const name = `copy-hook-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/copy-hook.txt',
    })
    await insertTestDomainBlacklist(kept, name)
    let copied = false
    try {
      const result = await syncDomainsWithDatabase(
        sourceId,
        new Response(`${kept}\n${added}\n`),
        'url',
        undefined,
        {
          writerLsn: '0/20',
          copySourceMembership: async (_sourceId, destination) => {
            copied = true
            writeFileSync(destination, `${kept}\n`)
          },
        },
      )
      expect(copied).toBe(true)
      expect(result.domainsAdded).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual(
        [added, kept].toSorted(),
      )
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
    try {
      const result = await syncDomainsWithDatabase(
        sourceId,
        new Response(`${kept}\n${added}\n`),
        'url',
        undefined,
        {
          writerLsn: '0/20',
          replicaCoversWriterLsn: async () => true,
          copySourceMembership: async (_sourceId, destination) => {
            writeFileSync(destination, '')
          },
        },
      )
      expect(result.domainsAdded).toBe(1)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual(
        [added, kept].toSorted(),
      )
      await expect(getTestBlacklistMembershipDiffAppliedAt(sourceId)).resolves.toBeInstanceOf(Date)
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
      expect(diffDirectories().filter(directory => !before.has(directory))).toEqual([])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})

function diffDirectories(): string[] {
  return readdirSync(tmpdir()).filter(name => name.startsWith(BLOCKLIST_DIFF_DIRECTORY_PREFIX))
}

function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}
