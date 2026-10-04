import { describe, expect, it } from 'vitest'
import { copyrightImageSurfaceLabel, type CopyrightImageSurface } from './copyright-image-surfaces'

describe('copyright image surface labels', () => {
  it.each([
    ['post-image', 'Post image'],
    ['user-profile-image', 'Profile image'],
    ['user-profile-link-image', 'Profile link image'],
    ['topic-logo-image', 'Topic logo'],
    ['topic-hero-image', 'Topic hero image'],
    ['community-profile-image', 'Community profile image'],
    ['community-banner-image', 'Community banner image'],
  ] as const)('names %s for notice readers', (surface, label) => {
    expect(copyrightImageSurfaceLabel(surface satisfies CopyrightImageSurface)).toBe(label)
  })
})
