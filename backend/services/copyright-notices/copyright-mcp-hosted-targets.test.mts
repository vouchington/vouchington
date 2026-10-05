import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  insertTestImage,
  markImageDeleted,
  markImageModerationFlagged,
} from '@voucha/test-helpers/entities/images'
import { softDeleteUser } from '@voucha/test-helpers/entities/users'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import { setTestTopicSurfaceImages } from '@voucha/test-helpers/entities/media-surface-writes'
import { createProfileLink } from '../my/profile-links.mts'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  publishStagedMediaDeliveryRecord,
  stageImagePlacementDeliveryRecord,
} from '@services/media-delivery-safety'
import { resolveCopyrightImagePlacement } from './placement-resolution.mts'
import { resolveCopyrightMcpHostedTarget } from './copyright-mcp-hosted-targets.mts'

type SurfaceFixture = Awaited<ReturnType<typeof createTestCopyrightImageFixture>>

async function canonicalUrl(fixture: SurfaceFixture): Promise<string> {
  return (await resolveCopyrightImagePlacement(fixture.selector)).hostedUseUrl
}

async function publishSurface(fixture: SurfaceFixture): Promise<void> {
  const staged = await stageImagePlacementDeliveryRecord({
    placementId: fixture.placementId,
    revision: fixture.placementRevision,
    imageId: fixture.imageId,
    state: 'allow',
  })
  await publishStagedMediaDeliveryRecord(staged.deliveryKey)
}

function ownerBinding(fixture: SurfaceFixture): Record<string, string> {
  switch (fixture.selector.surfaceKind) {
    case 'user-profile-image':
      return { user_id: fixture.ownerId }
    case 'user-profile-link-image':
      return { user_profile_link_id: fixture.selector.userProfileLinkId }
    case 'topic-logo-image':
    case 'topic-hero-image':
      return { topic_id: fixture.ownerId }
    case 'community-profile-image':
    case 'community-banner-image':
      return { community_id: fixture.ownerId }
    case 'post-image':
      return { post_id: fixture.ownerId }
  }
}

const nonPostKinds = [
  'user-profile-image',
  'user-profile-link-image',
  'topic-logo-image',
  'topic-hero-image',
  'community-profile-image',
  'community-banner-image',
] as const

describe('MCP hosted copyright target resolution', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(nonPostKinds)('selects the sole live %s on its canonical public page', async kind => {
    const fixture = await createTestCopyrightImageFixture(kind)
    const targetUrl = await canonicalUrl(fixture)
    await publishSurface(fixture)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).resolves.toEqual({
      surface: kind,
      image_id: fixture.imageId,
      target_url: targetUrl,
      ...ownerBinding(fixture),
    })
  })

  it('rejects a user page with both profile and profile-link images as ambiguous', async () => {
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const targetUrl = await canonicalUrl(fixture)
    await publishSurface(fixture)
    const linkImageId = await insertTestImage(fixture.actorUserId)
    const link = await createProfileLink(fixture.actorUserId, {
      link_type: 'github',
      handle: `mcp_${crypto.randomUUID().replaceAll('-', '')}`,
      image_id: linkImageId,
    })
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).resolves.toMatchObject({
      surface: 'user-profile-image',
      image_id: fixture.imageId,
    })
    const linkPlacement = await getTestImageSurfacePlacements({
      profileLinkId: link.id,
      imageId: linkImageId,
    })
    if (!linkPlacement[0]) throw new Error('Profile link image placement missing')
    const linkRecord = await stageImagePlacementDeliveryRecord({
      placementId: linkPlacement[0].placement_id,
      revision: linkPlacement[0].placement_revision,
      imageId: linkImageId,
      state: 'allow',
    })
    await publishStagedMediaDeliveryRecord(linkRecord.deliveryKey)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).rejects.toMatchObject({
      status: 422,
      message: 'Hosted target URL must identify exactly one live image',
    })
  })

  it('rejects a topic page with both logo and hero images as ambiguous', async () => {
    const fixture = await createTestCopyrightImageFixture('topic-logo-image')
    const targetUrl = await canonicalUrl(fixture)
    await publishSurface(fixture)
    const heroImageId = await insertTestImage(fixture.actorUserId)
    await setTestTopicSurfaceImages(fixture.ownerId, { heroImageId })
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).resolves.toMatchObject({
      surface: 'topic-logo-image',
      image_id: fixture.imageId,
    })
    const [heroPlacement] = await getTestImageSurfacePlacements({
      topicId: fixture.ownerId,
      imageId: heroImageId,
      surfaceKind: 'topic-hero-image',
    })
    if (!heroPlacement) throw new Error('Topic hero image placement missing')
    const heroRecord = await stageImagePlacementDeliveryRecord({
      placementId: heroPlacement.placement_id,
      revision: heroPlacement.placement_revision,
      imageId: heroImageId,
      state: 'allow',
    })
    await publishStagedMediaDeliveryRecord(heroRecord.deliveryKey)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).rejects.toMatchObject({
      status: 422,
      message: 'Hosted target URL must identify exactly one live image',
    })
  })

  it('rejects a deleted owner even when its image placement remains', async () => {
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const targetUrl = await canonicalUrl(fixture)
    await publishSurface(fixture)
    await softDeleteUser(fixture.ownerId)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).rejects.toMatchObject({ status: 422 })
  })

  it('rejects an unavailable image and a retired surface', async () => {
    const deleted = await createTestCopyrightImageFixture('community-banner-image')
    const deletedUrl = await canonicalUrl(deleted)
    await publishSurface(deleted)
    await markImageDeleted(deleted.imageId)
    await expect(resolveCopyrightMcpHostedTarget(deletedUrl)).rejects.toMatchObject({ status: 422 })

    const retired = await createTestCopyrightImageFixture('user-profile-link-image')
    const retiredUrl = await canonicalUrl(retired)
    await publishSurface(retired)
    await retired.detach()
    await expect(resolveCopyrightMcpHostedTarget(retiredUrl)).rejects.toMatchObject({ status: 422 })
  })

  it('does not resolve an unacknowledged surface until its allow delivery completes', async () => {
    const fixture = await createTestCopyrightImageFixture('community-profile-image')
    const targetUrl = await canonicalUrl(fixture)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).rejects.toMatchObject({ status: 422 })
    await publishSurface(fixture)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).resolves.toMatchObject({
      surface: 'community-profile-image',
      image_id: fixture.imageId,
    })
  })

  it('rejects a published image that subsequently fails moderation clearance', async () => {
    const fixture = await createTestCopyrightImageFixture('topic-hero-image')
    const targetUrl = await canonicalUrl(fixture)
    await publishSurface(fixture)
    await markImageModerationFlagged(fixture.imageId)
    await expect(resolveCopyrightMcpHostedTarget(targetUrl)).rejects.toMatchObject({ status: 422 })
  })

  it.each([
    'https://elsewhere.example/user/contact-secret@example.test',
    'https://voucha.ai/user/hosted?email=contact-secret@example.test',
    'https://voucha.ai/unsupported/contact-secret@example.test',
  ])('returns a generic 422 without reflecting private URL content for %s', async url => {
    await expect(resolveCopyrightMcpHostedTarget(url)).rejects.toMatchObject({
      status: 422,
      message: expect.not.stringContaining('contact-secret@example.test'),
    })
  })
})
