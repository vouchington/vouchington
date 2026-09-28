import { describe, expect, it } from 'vitest'
import { buildSideloadImageUrl } from './index.mts'
import {
  authorizeDependencyStates,
  firstPartyMediaBlockedHosts,
  isCurrentSideloadRoute,
  isFirstPartyMediaUrl,
  isPlacementSourcePolicy,
  isRemovedSideloadRoute,
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
    expect(authorizeDependencyStates(['allow'])).toBe('allow')
    expect(authorizeDependencyStates(['allow', 'withheld'])).toBe('deny')
    expect(authorizeDependencyStates(['unknown'])).toBe('deny')
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
