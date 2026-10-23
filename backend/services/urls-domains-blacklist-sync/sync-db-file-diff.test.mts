import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  countBlacklistEntriesBySource,
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  explainBlocklistedDomainOrderPlan,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
  observeTestPostgresClientQueries,
} from '@voucha/test-helpers'
import { ADDED_DOMAINS_TABLE } from './sync-cache.mts'
import { writeCommDiff, writeSortedDesiredDomains } from './diff-files.mts'
import {
  applyDomainDiffFiles,
  BLOCKLIST_DIFF_DIRECTORY_PREFIX,
  syncDomainsWithDatabase,
} from './sync-db.mts'

describe('blocklist file diff', () => {
  it('reads membership from the replica and stages only the diff', async () => {
    const suffix = sourceNameSuffix()
    const domain = `added-${suffix}.example`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `file-diff-${suffix}`,
      url: 'https://example.com/file-diff.txt',
    })
    const observed = await observeTestPostgresClientQueries(() =>
      syncDomainsWithDatabase(sourceId, new Response(`${domain}\n`), 'url'),
    )
    try {
      const membership = observed.queries.filter(query =>
        query.text.includes('copySourceMembership'),
      )
      expect(membership.map(query => query.pool)).toEqual(['read'])
      const copyIndex = observed.queries.findIndex(query =>
        query.text.includes('copySourceMembership'),
      )
      expect(copyIndex).toBeGreaterThanOrEqual(0)
      // Another task in the worker can lock first; this sync must still lock after its COPY.
      expect(
        observed.queries
          .slice(copyIndex + 1)
          .some(query => query.text.includes('pg_advisory_xact_lock')),
      ).toBe(true)
      expect(observed.result).toEqual({ skipped: false, domainsAdded: 1, domainsRemoved: 0 })
      expect(
        observed.queries.some(query => query.text.includes('tmp_domain_blacklist_raw_domains')),
      ).toBe(false)
      expect(
        observed.queries.some(query => query.text.includes('tmp_domain_blacklist_new_domains')),
      ).toBe(false)
      expect(observed.queries.some(query => query.text.includes(ADDED_DOMAINS_TABLE))).toBe(true)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([domain])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('keeps a domain the stale membership snapshot omitted and absorbs a repeated addition', async () => {
    const suffix = sourceNameSuffix()
    const kept = `kept-${suffix}.example`
    const present = `present-${suffix}.example`
    const name = `stale-diff-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/stale-diff.txt',
    })
    const directory = mkdtempSync(join(tmpdir(), 'blocklist-stale-'))
    try {
      await insertTestDomainBlacklist(kept, name)
      await insertTestDomainBlacklist(present, name)
      const membershipPath = join(directory, 'membership')
      const desiredPath = join(directory, 'desired')
      const addedPath = join(directory, 'added')
      const removedPath = join(directory, 'removed')
      writeFileSync(membershipPath, '')
      writeFileSync(desiredPath, `${present}\n`)
      await writeCommDiff({ membershipPath, desiredPath, addedPath, removedPath })
      const result = await applyDomainDiffFiles(sourceId, 'url', addedPath, removedPath)
      expect(result).toEqual({ skipped: false, domainsAdded: 1, domainsRemoved: 0 })
      expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)
      await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual(
        [kept, present].toSorted(),
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('applies nothing and removes temp files when the download is interrupted', async () => {
    const suffix = sourceNameSuffix()
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `interrupt-${suffix}`,
      url: 'https://example.com/interrupt.txt',
    })
    const before = new Set(diffDirectories())
    try {
      await expect(syncDomainsWithDatabase(sourceId, interruptedDownload(), 'url')).rejects.toThrow(
        Error,
      )
      expect(await countBlacklistEntriesBySource(sourceId)).toBe(0)
      expect(diffDirectories().filter(name => !before.has(name))).toEqual([])
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('plans the source-cache keyset with the C-collation index', async () => {
    const suffix = sourceNameSuffix()
    const name = `explain-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/explain.txt',
    })
    try {
      await insertTestDomainBlacklist(`explain-${suffix}.example`, name)
      const plan = await explainBlocklistedDomainOrderPlan(sourceId)
      expect(plan).toContain('idx_blocklisted_domains__source_id__domain')
      expect(plan).toMatch(/Index (?:Only )?Scan/)
      expect(plan).not.toContain('Sort')
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('sorts and diffs additions and removals on disk', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'blocklist-file-diff-'))
    const membershipPath = join(directory, 'membership')
    const desiredPath = join(directory, 'desired')
    const addedPath = join(directory, 'added')
    const removedPath = join(directory, 'removed')
    try {
      writeFileSync(membershipPath, 'a.example\nc.example\n')
      await writeSortedDesiredDomains(
        new Response('b.example\na.example\nb.example\n'),
        desiredPath,
      )
      await writeCommDiff({ membershipPath, desiredPath, addedPath, removedPath })
      expect(readFileSync(desiredPath, 'utf8')).toBe('a.example\nb.example\n')
      expect(readFileSync(addedPath, 'utf8')).toBe('b.example\n')
      expect(readFileSync(removedPath, 'utf8')).toBe('c.example\n')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

function interruptedDownload(): Response {
  const encoder = new TextEncoder()
  let sent = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 2) {
          controller.error(new Error('download interrupted'))
          return
        }
        controller.enqueue(encoder.encode(`partial-${sent}.example\n`))
        sent += 1
      },
    }),
  )
}

function diffDirectories(): string[] {
  return readdirSync(tmpdir()).filter(name => name.startsWith(BLOCKLIST_DIFF_DIRECTORY_PREFIX))
}

function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}
