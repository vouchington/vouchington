import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFeedListDirectory, removeFeedListDirectory } from './feed-list-temp-file.mts'

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
