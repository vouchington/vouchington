/* oxlint-disable vitest/require-top-level-describe -- the shared temp-directory cleanup applies to every focused helper suite in this file. */
import { afterEach, describe, expect, it } from 'vitest'
import { extractDomRemovals } from '@jongleberry/vurst-html'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CrawlHtmlTempFile } from '@services/crawls/s3'
import { filterValidUtf8HtmlFiles, selectHtmlFilesWithinByteBudget } from './processors.mts'

const VALID_HTML_A = Buffer.from('<html><body><p>Hello world one</p></body></html>')
const VALID_HTML_B = Buffer.from('<html><body><p>Hello world two</p></body></html>')
// Truncated multi-byte UTF-8 sequence (0xe2 0x80 with no continuation byte) — the exact
// shape of malformed bytes a botched crawl/encoding-transcode can leave in scraped HTML.
const INVALID_UTF8_HTML = Buffer.from([0x3c, 0x70, 0x3e, 0xe2, 0x80, 0x3c, 0x2f, 0x70, 0x3e])

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(tempDir => rm(tempDir, { recursive: true, force: true })),
  )
})

describe('filterValidUtf8HtmlFiles', () => {
  it('keeps only files that are valid UTF-8', async () => {
    const files = await createArtifacts([VALID_HTML_A, INVALID_UTF8_HTML, VALID_HTML_B])
    expect(await filterValidUtf8HtmlFiles(files)).toEqual([files[0], files[2]])
  })

  it('returns an empty array when every file is invalid', async () => {
    expect(await filterValidUtf8HtmlFiles(await createArtifacts([INVALID_UTF8_HTML]))).toEqual([])
  })

  it('handles a valid multi-byte sequence split across read chunks', async () => {
    const prefix = Buffer.alloc(64 * 1024 - 1, 'a')
    const files = await createArtifacts([Buffer.concat([prefix, Buffer.from('é')])])
    expect(await filterValidUtf8HtmlFiles(files)).toEqual(files)
  })
})

describe('extractDomRemovals invalid-UTF-8 regression (BACKEND-KG)', () => {
  it('rejects a batch containing an invalid-UTF-8 page', async () => {
    await expect(
      extractDomRemovals([VALID_HTML_A, INVALID_UTF8_HTML, VALID_HTML_B]),
    ).rejects.toThrow(/utf-?8/i)
  })

  it('succeeds once filterValidUtf8HtmlFiles removes the invalid page first', async () => {
    const filtered = await filterValidUtf8HtmlFiles(
      await createArtifacts([VALID_HTML_A, INVALID_UTF8_HTML, VALID_HTML_B]),
    )
    const pages = await Promise.all(filtered.map(file => readFile(file.filePath)))
    await expect(extractDomRemovals(pages)).resolves.toEqual(
      expect.objectContaining({
        cssSelectorsToRemove: expect.any(Array),
        htmlToRemove: expect.any(Array),
      }),
    )
  })
})

describe('selectHtmlFilesWithinByteBudget', () => {
  it('keeps every page when the total is within budget', () => {
    const files = [createArtifact(10), createArtifact(20)]
    expect(selectHtmlFilesWithinByteBudget(files, 100)).toEqual([files[0], files[1]])
  })

  it('drops the largest pages first to stay within budget, smallest first', () => {
    const small = createArtifact(10)
    const medium = createArtifact(20)
    const large = createArtifact(80)
    expect(selectHtmlFilesWithinByteBudget([large, small, medium], 30)).toEqual([small, medium])
  })

  it('returns an empty array when even the smallest page exceeds budget', () => {
    expect(selectHtmlFilesWithinByteBudget([createArtifact(50)], 10)).toEqual([])
  })
})

describe('extractDomRemovals oversized-combined-input regression (BACKEND-KA)', () => {
  it('rejects a batch whose combined size exceeds the native library cap', async () => {
    const oversized = [Buffer.alloc(6 * 1024 * 1024, 'a'), Buffer.alloc(6 * 1024 * 1024, 'b')]
    await expect(extractDomRemovals(oversized)).rejects.toThrow(/input too large/i)
  })

  it('selectHtmlFilesWithinByteBudget trims the batch so the combined size fits', () => {
    const oversized = [createArtifact(6 * 1024 * 1024), createArtifact(6 * 1024 * 1024)]
    const budgeted = selectHtmlFilesWithinByteBudget(oversized)

    expect(budgeted).toHaveLength(1)
    expect(budgeted[0]).toBe(oversized[0])
  })

  it('succeeds once the trimmed batch still has at least 2 pages', async () => {
    const withinBudget = [createArtifact(3), createArtifact(3), createArtifact(6)]
    const budgeted = selectHtmlFilesWithinByteBudget(withinBudget, 10)
    expect(budgeted).toHaveLength(2)
    expect(budgeted[0]).toBe(withinBudget[0])
    expect(budgeted[1]).toBe(withinBudget[1])
  })
})

async function createArtifacts(contents: Buffer[]): Promise<CrawlHtmlTempFile[]> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-processor-test-'))
  tempDirs.push(tempDir)
  return await Promise.all(
    contents.map(async (content, index) => {
      const filePath = path.join(tempDir, `${index}.html`)
      await writeFile(filePath, content)
      return { filePath, byteLength: content.byteLength, cleanup: async () => undefined }
    }),
  )
}

function createArtifact(byteLength: number): CrawlHtmlTempFile {
  return {
    filePath: `/unused/${byteLength}`,
    byteLength,
    cleanup: async () => undefined,
  }
}
