import { describe, expect, it } from 'vitest'
import { gunzipBytes, gzipBytes } from './compression.mts'

describe('compression helpers', () => {
  it('gzip and gunzip bytes', async () => {
    const value = new TextEncoder().encode('hello world')

    const compressed = await gzipBytes(value)
    const decompressed = await gunzipBytes(compressed)

    expect(compressed.byteLength).toBeGreaterThan(0)
    expect(new TextDecoder().decode(decompressed)).toBe('hello world')
  })
})
