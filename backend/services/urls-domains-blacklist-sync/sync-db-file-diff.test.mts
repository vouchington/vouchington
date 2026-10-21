import { once } from 'node:events'
import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { finished } from 'node:stream/promises'
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

const MILLION_ROWS = 1_000_000

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

  it('plans the ordered membership read with the C-collation index', async () => {
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

  it('diffs a million domains through sort and comm onto disk', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'blocklist-heap-'))
    const membershipPath = join(directory, 'membership')
    const desiredPath = join(directory, 'desired')
    const addedPath = join(directory, 'added')
    const removedPath = join(directory, 'removed')
    try {
      await writeNumberedDomains(membershipPath, MILLION_ROWS)
      await writeSortedDesiredDomains(numberedDownload(MILLION_ROWS), desiredPath)
      await writeCommDiff({ membershipPath, desiredPath, addedPath, removedPath })
      expect(await countLines(desiredPath)).toBe(MILLION_ROWS)
      expect(await countLines(addedPath)).toBe(0)
      expect(await countLines(removedPath)).toBe(0)
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

function numberedDownload(total: number): Response {
  const encoder = new TextEncoder()
  let sent = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === total) {
          controller.close()
          return
        }
        const count = Math.min(1_000, total - sent)
        let block = ''
        for (let offset = 0; offset < count; offset += 1) {
          block += `heap-${String(sent + offset).padStart(7, '0')}.example\n`
        }
        controller.enqueue(encoder.encode(block))
        sent += count
      },
    }),
  )
}

async function writeNumberedDomains(path: string, total: number): Promise<void> {
  const output = createWriteStream(path)
  for (let sent = 0; sent < total; sent += 1_000) {
    const count = Math.min(1_000, total - sent)
    let block = ''
    for (let offset = 0; offset < count; offset += 1) {
      block += `heap-${String(sent + offset).padStart(7, '0')}.example\n`
    }
    if (output.write(block)) continue
    await once(output, 'drain')
  }
  output.end()
  await finished(output)
}

async function countLines(path: string): Promise<number> {
  let count = 0
  for await (const line of createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  })) {
    if (line.length > 0) count += 1
  }
  return count
}

function diffDirectories(): string[] {
  return readdirSync(tmpdir()).filter(name => name.startsWith(BLOCKLIST_DIFF_DIRECTORY_PREFIX))
}

function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}
