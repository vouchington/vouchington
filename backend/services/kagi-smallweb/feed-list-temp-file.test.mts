import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { lstat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIELD_SEPARATOR, numberedLine } from './feed-list-lines.mts'
import {
  createFeedListDirectory,
  FEED_LIST_DIRECTORY_MAX_AGE_MS,
  readFeedListPage,
  removeFeedListDirectory,
  sweepExpiredFeedListDirectories,
} from './feed-list-temp-file.mts'

describe('removeFeedListDirectory', () => {
  it('removes a directory created for this run', async () => {
    const directory = await createFeedListDirectory()
    await removeFeedListDirectory(directory)
    expect(existsSync(directory)).toBe(false)
  })

  it('refuses a payload path outside the temporary run prefix', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'not-kagi-'))
    const marker = join(outside, 'keep')
    writeFileSync(marker, 'x')
    const disguised = join(tmpdir(), `kagi-feed-list-${process.pid}-fake`, '..', basename(outside))
    try {
      await expect(removeFeedListDirectory(outside)).rejects.toThrow('temporary run prefix')
      await expect(removeFeedListDirectory(disguised)).rejects.toThrow('temporary run prefix')
      expect(existsSync(marker)).toBe(true)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('readFeedListPage', () => {
  it('uses C byte order for a cursor and the added-file merge', async () => {
    const directory = await createFeedListDirectory()
    const privateUse = 'https://example.com/\uE000'
    const astral = 'https://example.com/😀'
    const entry = (feedUrl: string) => ({
      feedUrl,
      name: feedUrl,
      slug: 'feed',
      sourceType: 'web' as const,
    })
    try {
      writeFileSync(
        join(directory, 'deduped'),
        numberedLine(entry(privateUse), 1) + numberedLine(entry(astral), 2),
      )
      writeFileSync(join(directory, 'added'), `${privateUse}\n${astral}\n`)
      const first = await readFeedListPage(directory, undefined, 1)
      expect(first.page.map(item => item.feedUrl)).toEqual([privateUse])
      const second = await readFeedListPage(directory, privateUse, 1)
      expect(second.page.map(item => item.feedUrl)).toEqual([astral])
      expect(second.newEntries.map(item => item.feedUrl)).toEqual([astral])
    } finally {
      await removeFeedListDirectory(directory)
    }
  })

  it('parses only the lines on the current page', async () => {
    const directory = await createFeedListDirectory()
    const before = 'https://example.com/a'
    const current = 'https://example.com/b'
    const after = 'https://example.com/c'
    const entry = (feedUrl: string) => ({
      feedUrl,
      name: feedUrl,
      slug: 'feed',
      sourceType: 'web' as const,
    })
    try {
      writeFileSync(
        join(directory, 'deduped'),
        `${before}${FIELD_SEPARATOR}1${FIELD_SEPARATOR}not-json\n${numberedLine(entry(current), 2)}${after}${FIELD_SEPARATOR}3${FIELD_SEPARATOR}not-json\n`,
      )
      writeFileSync(join(directory, 'added'), `${current}\n`)
      const page = await readFeedListPage(directory, before, 1)
      expect(page.page).toEqual([entry(current)])
      expect(page.newEntries).toEqual([entry(current)])
      expect(page.total).toBe(2)
    } finally {
      await removeFeedListDirectory(directory)
    }
  })
})

describe('sweepExpiredFeedListDirectories', () => {
  it('removes every process prefix only after it is older than one hour', async () => {
    const otherPid = process.pid === 1 ? 2 : 1
    const expired = await createFeedListDirectory()
    const expiredOther = mkdtempSync(join(tmpdir(), `kagi-feed-list-${otherPid}-`))
    const boundary = await createFeedListDirectory()
    const freshOther = mkdtempSync(join(tmpdir(), `kagi-feed-list-${otherPid}-`))
    const unrelated = mkdtempSync(join(tmpdir(), 'not-kagi-'))
    const recorded = await lstat(boundary)
    const aged = new Date(recorded.mtimeMs - 5_000)
    const freshAt = new Date(recorded.mtimeMs + 10_000)
    await utimes(expired, aged, aged)
    await utimes(expiredOther, aged, aged)
    await utimes(freshOther, freshAt, freshAt)
    try {
      await sweepExpiredFeedListDirectories(recorded.mtimeMs + FEED_LIST_DIRECTORY_MAX_AGE_MS)
      expect(existsSync(expired)).toBe(false)
      expect(existsSync(expiredOther)).toBe(false)
      expect(existsSync(boundary)).toBe(true)
      expect(existsSync(freshOther)).toBe(true)
      expect(existsSync(unrelated)).toBe(true)

      await sweepExpiredFeedListDirectories(recorded.mtimeMs + FEED_LIST_DIRECTORY_MAX_AGE_MS + 1)
      expect(existsSync(boundary)).toBe(false)
      expect(existsSync(freshOther)).toBe(true)
      expect(existsSync(unrelated)).toBe(true)
    } finally {
      if (existsSync(boundary)) await removeFeedListDirectory(boundary)
      if (existsSync(freshOther)) await removeFeedListDirectory(freshOther)
      rmSync(unrelated, { recursive: true, force: true })
    }
  })
})
