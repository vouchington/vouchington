import { describe, expect, it } from 'vitest'
import { serializeImageOriginBootstrapScript } from '../image-origin-bootstrap'

describe('serializeImageOriginBootstrapScript', () => {
  it('omits the bootstrap script when IMAGE_ORIGIN is unset', () => {
    expect(serializeImageOriginBootstrapScript(undefined)).toBeNull()
  })

  it('normalizes a trailing slash in the serialized origin', () => {
    expect(serializeImageOriginBootstrapScript('https://images.example.com/')).toBe(
      'window.__IMAGE_ORIGIN__="https://images.example.com"',
    )
  })

  it('rejects an origin containing a path instead of serializing it', () => {
    expect(() => serializeImageOriginBootstrapScript('https://images.example.com/path')).toThrow(
      'IMAGE_ORIGIN',
    )
  })
})
