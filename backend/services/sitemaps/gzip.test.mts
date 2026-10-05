import { access, readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'

describe('sitemap gzip helpers', () => {
  it('streams utf-8 xml content into a temporary gzip file', async () => {
    const xml = '<?xml version="1.0"?><urlset><url><loc>https://example.com</loc></url></urlset>'
    const { filePath, contentHash } = await createGzipFileFromUtf8Chunks([xml])
    const compressed = await readFile(filePath)

    expect(contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(compressed.byteLength).toBeGreaterThan(0)
    expect(gunzipSync(compressed).toString()).toBe(xml)

    await deleteTemporaryGzipFile(filePath)

    await expect(access(filePath)).rejects.toThrow(Error)
  })
})
