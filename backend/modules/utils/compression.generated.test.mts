import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { gzipBytes } from './compression.mts'

describe('compression helpers', () => {
  it('gzip and gunzip bytes', async () => {
    const value = new TextEncoder().encode('hello world')

    const compressed = await gzipBytes(value)
    expect(compressed.byteLength).toBeGreaterThan(0)
    expect(gunzipSync(compressed).toString()).toBe('hello world')
  })
})
