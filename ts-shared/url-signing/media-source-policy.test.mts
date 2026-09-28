import { describe, expect, it } from 'vitest'
import { buildSideloadImageUrl } from './index.mts'
import { isCurrentSideloadRoute, isRemovedSideloadRoute } from './media-source-policy.mts'

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
})
