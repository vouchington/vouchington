import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { numberedLine } from './feed-list-lines.mts'
import {
  createFeedListDirectory,
  readFeedListPage,
  removeFeedListDirectory,
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
})
