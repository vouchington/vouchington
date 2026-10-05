import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import {
  createTestCopyrightImageFixture,
  TEST_COPYRIGHT_IMAGE_KINDS,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { testClaimantCanViewCopyrightImage } from '@voucha/test-helpers/copyright-placement-policy-boundaries'
import { resolveCopyrightImagePlacement } from './placement-resolution.mts'

describe('copyright image placement resolution', () => {
  it('resolves a story image to its canonical story URL', async () => {
    const fixture = await createTestCopyrightImageFixture('post-image', { postType: 'story' })
    const resolved = await resolveCopyrightImagePlacement(fixture.selector)
    expect(new URL(resolved.hostedUseUrl).pathname).toMatch(/^\/story\//)
  })

  it.each(TEST_COPYRIGHT_IMAGE_KINDS)(
    'resolves a live %s image to its current placement',
    async kind => {
      const fixture = await createTestCopyrightImageFixture(kind)
      const resolved = await resolveCopyrightImagePlacement(fixture.selector)
      expect(resolved).toMatchObject({
        bindingFamily: kind === 'post-image' ? 'post' : 'surface',
        placementId: fixture.placementId,
        placementRevision: fixture.placementRevision,
        imageId: fixture.imageId,
      })
      expect(new URL(resolved.hostedUseUrl).hostname).toBe(
        new URL(SITEMAP_CONFIG.BASE_URL).hostname,
      )
    },
  )

  it('resolves a profile-link image through the link owner, not a surface user ID', async () => {
    const fixture = await createTestCopyrightImageFixture('user-profile-link-image')
    const resolved = await resolveCopyrightImagePlacement(fixture.selector)
    expect(new URL(resolved.hostedUseUrl).pathname).toMatch(/^\/user\//)
    if (!('userProfileLinkId' in fixture.selector)) throw new Error('Expected profile link')
    const [placement] = await getTestImageSurfacePlacements({
      profileLinkId: fixture.selector.userProfileLinkId,
      imageId: fixture.imageId,
    })
    expect(placement?.user_id).toBeNull()
  })

  it.each(TEST_COPYRIGHT_IMAGE_KINDS)('rejects a mismatched image for %s', async kind => {
    const fixture = await createTestCopyrightImageFixture(kind)
    await expect(
      resolveCopyrightImagePlacement({
        ...fixture.selector,
        imageId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it.each(TEST_COPYRIGHT_IMAGE_KINDS)('rejects a retired %s placement', async kind => {
    const fixture = await createTestCopyrightImageFixture(kind)
    await fixture.detach()
    await expect(resolveCopyrightImagePlacement(fixture.selector)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('does not resolve the same image under another profile owner', async () => {
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const other = await createTestUserDirect()
    await expect(
      resolveCopyrightImagePlacement({
        surfaceKind: 'user-profile-image',
        userId: other.id,
        imageId: fixture.imageId,
        hostedUseUrl: 'https://voucha.ai/user/other',
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a hidden community banner to a claimant while staff can resolve it', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image', {
      communityVisibility: 'private',
    })
    const claimant = await createTestUserDirect()
    await expect(resolveCopyrightImagePlacement(fixture.selector)).resolves.toMatchObject({
      placementId: fixture.placementId,
    })
    await expect(testClaimantCanViewCopyrightImage(fixture.selector, claimant)).resolves.toBe(false)
  })
})
