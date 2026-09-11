import { describe, expect, it } from 'vitest'
import { getOEmbedEndpointHostname } from './endpoint-hostname.mts'

describe('getOEmbedEndpointHostname', () => {
  it('returns the destination hostname for a valid endpoint', () => {
    expect(getOEmbedEndpointHostname('https://video.example/oembed?id=1')).toBe('video.example')
  })

  it('rejects malformed persisted endpoints', () => {
    expect(getOEmbedEndpointHostname('not a URL')).toBeNull()
  })
})
