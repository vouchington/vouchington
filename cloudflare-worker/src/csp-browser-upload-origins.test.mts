import { describe, expect, it } from 'vitest'
import { parseBrowserUploadOrigins } from './csp-browser-upload-origins.mts'

const origins = [
  'https://test-images.s3.us-west-2.amazonaws.com',
  'https://test-images.s3.dualstack.us-west-2.amazonaws.com',
]

describe('parseBrowserUploadOrigins', () => {
  it('accepts exact regional and dual-stack S3 HTTPS origins', () => {
    expect(parseBrowserUploadOrigins(JSON.stringify(origins))).toEqual(origins)
  })

  it('rejects missing, non-S3, path-bearing, or malformed configuration', () => {
    for (const value of [
      undefined,
      '[]',
      '["https://example.com"]',
      '["https://test-images.s3.us-west-2.amazonaws.com/path"]',
      '["not-an-origin"]',
      'not-json',
    ]) {
      expect(() => parseBrowserUploadOrigins(value)).toThrow('CSP_BROWSER_UPLOAD_ORIGINS')
    }
  })
})
