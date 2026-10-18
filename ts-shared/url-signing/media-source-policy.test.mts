import { describe, expect, it } from 'vitest'
import {
  buildSideloadImageUrl,
  firstPartyMediaBlockedHosts,
  isFirstPartyMediaUrl,
} from './index.mts'
import {
  getImagePlacementDeliveryKey,
  isCurrentSideloadRoute,
  isPlacementSourcePolicy,
  isRemovedSideloadRoute,
  parseMediaDeliveryEdgeEnforcementMode,
} from './media-source-policy.mts'

describe('media source policy', () => {
  const imageOrigin = 'https://images.example.com'
  const opts = { imageOrigin, width: 400, signingKeys: [] }

  it('refuses first-party media origins and configured aliases at signing', () => {
    expect(buildSideloadImageUrl('https://images.voucha.ai/a.jpg', opts)).toBeNull()
    expect(buildSideloadImageUrl('https://images-staging.voucha.ai/a.jpg', opts)).toBeNull()
    expect(
      buildSideloadImageUrl('https://images.example.com/a.jpg', {
        ...opts,
        imageOrigin: 'https://images.example.com/',
      }),
    ).toBeNull()
    expect(
      buildSideloadImageUrl('https://edge.media.partner.test/a.jpg', {
        ...opts,
        aliases: ['media.partner.test'],
      }),
    ).toBeNull()
  })

  it('treats only /sideload/v2/<token> as the current route', () => {
    expect(isCurrentSideloadRoute('/sideload/v2/token')).toBe(true)
    expect(isRemovedSideloadRoute('/sideload/token')).toBe(true)
    expect(isRemovedSideloadRoute('/sideload/v2/token/extra')).toBe(true)
    expect(isRemovedSideloadRoute('/sideload/v2/token')).toBe(false)
  })

  it('accepts only a safe placement tuple and denies any non-allow dependency', () => {
    const placementId = '018f6b2e-7c3a-7b2a-8c11-6a5e4d3c2b1a'
    const imageId = '018f6b2e-7c3a-7b2a-9c11-6a5e4d3c2b1a'
    expect(isPlacementSourcePolicy(null)).toBe(false)
    expect(isPlacementSourcePolicy('018f6b2e-7c3a-7b2a-8c11-6a5e4d3c2b1a')).toBe(false)
    expect(isPlacementSourcePolicy({ placementId, imageId, revision: 0 })).toBe(true)
    expect(isPlacementSourcePolicy({ placementId, imageId, revision: -1 })).toBe(false)
  })

  it('parses the edge enforcement mode and rejects unknown values', () => {
    expect(parseMediaDeliveryEdgeEnforcementMode({})).toBe('off')
    for (const mode of ['off', 'report', 'enforce']) {
      expect(
        parseMediaDeliveryEdgeEnforcementMode({ MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: mode }),
      ).toBe(mode)
    }
    expect(() =>
      parseMediaDeliveryEdgeEnforcementMode({ MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: 'true' }),
    ).toThrow('Invalid MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE')
  })

  it('builds the exact image placement registry key', () => {
    expect(
      getImagePlacementDeliveryKey({
        placementId: '018f6b2e-7c3a-7b2a-8c11-6a5e4d3c2b1a',
        revision: 2,
        imageId: '018f6b2e-7c3a-7b2a-9c11-6a5e4d3c2b1a',
      }),
    ).toBe(
      'image-placement:018f6b2e-7c3a-7b2a-8c11-6a5e4d3c2b1a:2:018f6b2e-7c3a-7b2a-9c11-6a5e4d3c2b1a',
    )
  })

  it('blocks configured image origins and ignores an unparsable host alias', () => {
    const env = {
      IMAGE_ORIGIN: 'https://Images.Example.com.',
      MEDIA_SOURCE_HOST_ALIASES: 'http://[',
    }
    const blocked = firstPartyMediaBlockedHosts(env)
    expect(blocked.exact).toContain('images.example.com')
    expect(blocked.suffixes).toContain('.images.example.com')
    expect(blocked.exact).not.toContain('http://[')
    expect(
      isFirstPartyMediaUrl(new URL('https://cdn.images.voucha.ai/a.jpg'), {
        imageOrigin: 'http://[',
        env,
      }),
    ).toBe(true)
    expect(isFirstPartyMediaUrl(new URL('https://cdn.example.net/a.jpg'), { env })).toBe(false)
  })
})

describe('buildSideloadImageUrl', () => {
  const imageOrigin = 'https://images.example.com'

  it('applies the product image origin, route and transform settings', () => {
    const result = buildSideloadImageUrl('https://source.example/image.jpg', {
      imageOrigin: 'https://images.example.com/',
      width: 400,
      signingKeys: [],
      quality: 75,
    })
    expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
    expect(result).toContain('w=400')
    expect(result).toContain('q=75')
  })

  it('leaves Voucha first-party media URLs unproxied', () => {
    expect(
      buildSideloadImageUrl('https://images.voucha.ai/media/image.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      }),
    ).toBeNull()
  })

  it('leaves product-configured media host aliases unproxied', () => {
    expect(
      buildSideloadImageUrl('https://cdn.customer.example/image.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
        aliases: ['customer.example'],
      }),
    ).toBeNull()
  })

  it('leaves an image URL already served by the configured image origin unchanged', () => {
    expect(
      buildSideloadImageUrl('https://images.example.com/sideload/v2/abc', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      }),
    ).toBeNull()
  })

  it('accepts missing signing keys as the product unsigned mode', () => {
    const result = buildSideloadImageUrl('https://source.example/image.jpg', {
      imageOrigin,
      width: 400,
      signingKeys: null as any,
    })
    expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
  })
})
