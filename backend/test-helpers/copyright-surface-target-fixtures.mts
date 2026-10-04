import { createTestUserDirect } from './entities/users.mts'
import { insertTestImage, insertTestPostImage } from './entities/images.mts'
import { insertTestPost } from './entities/posts.mts'
import { getTestPostImagePlacement, removeTestPostImage } from './entities/post-images.mts'
import { insertTestTopic } from './entities/topics.mts'
import { insertTestCommunity } from './entities/communities.mts'
import { getTestImageSurfacePlacements } from './entities/image-surface-placements.mts'
import {
  setTestCommunitySurfaceImages,
  setTestTopicSurfaceImages,
  setTestUserProfileImage,
} from './entities/media-surface-writes.mts'
import { createProfileLink, updateProfileLink } from '../services/my/profile-links.mts'
import {
  resolveCopyrightImagePlacement,
  type CopyrightImageSelector,
} from '../services/copyright-notices/placement-resolution.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
export const TEST_COPYRIGHT_IMAGE_KINDS = [
  'post-image',
  'user-profile-image',
  'user-profile-link-image',
  'topic-logo-image',
  'topic-hero-image',
  'community-profile-image',
  'community-banner-image',
] as const
export type TestCopyrightImageKind = (typeof TEST_COPYRIGHT_IMAGE_KINDS)[number]
type TestCopyrightImageFixture = {
  selector: CopyrightImageSelector
  imageId: string
  placementId: string
  placementRevision: number
  ownerId: string
  actorUserId: string
  ownerKind: 'post' | 'user' | 'topic' | 'community'
  detach: () => Promise<void>
}
export async function createTestCopyrightImageFixture(
  kind: TestCopyrightImageKind,
  options: {
    communityVisibility?: 'public' | 'private'
    actorAdministrator?: boolean
    actorModerator?: boolean
    actorWithEmail?: boolean
  } = {},
): Promise<TestCopyrightImageFixture> {
  const owner = await createTestUserDirect({
    administrator: options.actorAdministrator ?? kind.startsWith('topic-'),
    extraRoles: options.actorModerator ? ['moderator'] : [],
    withEmail: options.actorWithEmail ?? false,
  })
  const imageId = await insertTestImage(owner.id)
  const hostedUseUrl = `https://voucha.ai/unused/${crypto.randomUUID()}`
  if (kind === 'post-image') {
    const postId = await insertTestPost({
      title: `Copyright image ${crypto.randomUUID()}`,
      slug: `copyright-image-${crypto.randomUUID()}`,
      createdById: owner.id,
      markdown: 'An image',
    })
    await insertTestPostImage({ postId, imageId })
    const placement = await getTestPostImagePlacement(postId, imageId)
    if (!placement) throw new Error('Post image placement missing')
    return {
      selector: { surfaceKind: kind, postId, imageId, hostedUseUrl },
      imageId,
      placementId: placement.placement_id,
      placementRevision: placement.placement_revision,
      ownerId: postId,
      actorUserId: owner.id,
      ownerKind: 'post',
      detach: () => removeTestPostImage(postId, imageId),
    }
  }
  let selector: CopyrightImageSelector
  let scope: Parameters<typeof getTestImageSurfacePlacements>[0]
  let ownerId: string
  let ownerKind: TestCopyrightImageFixture['ownerKind']
  let detach: () => Promise<void>
  if (kind === 'user-profile-image') {
    await setTestUserProfileImage(owner.id, imageId)
    selector = { surfaceKind: kind, userId: owner.id, imageId, hostedUseUrl }
    scope = { userId: owner.id, surfaceKind: kind }
    ownerId = owner.id
    ownerKind = 'user'
    detach = () => setTestUserProfileImage(owner.id, null)
  } else if (kind === 'user-profile-link-image') {
    const link = await createProfileLink(owner.id, {
      link_type: 'github',
      handle: `image_${crypto.randomUUID().replaceAll('-', '')}`,
      image_id: imageId,
    })
    selector = { surfaceKind: kind, userProfileLinkId: link.id, imageId, hostedUseUrl }
    scope = { profileLinkId: link.id, surfaceKind: kind }
    ownerId = owner.id
    ownerKind = 'user'
    detach = async () => {
      await updateProfileLink(owner.id, link.id, { image_id: null })
    }
  } else if (kind === 'topic-logo-image' || kind === 'topic-hero-image') {
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Copyright ${suffix}`,
      slug: `copyright-${suffix}`,
      createdById: owner.id,
    })
    await setTestTopicSurfaceImages(
      topicId,
      kind === 'topic-logo-image' ? { logoImageId: imageId } : { heroImageId: imageId },
    )
    selector = { surfaceKind: kind, topicId, imageId, hostedUseUrl }
    scope = { topicId, surfaceKind: kind }
    ownerId = topicId
    ownerKind = 'topic'
    detach = () =>
      setTestTopicSurfaceImages(
        topicId,
        kind === 'topic-logo-image' ? { logoImageId: null } : { heroImageId: null },
      )
  } else {
    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: options.communityVisibility ?? 'public',
    })
    await setTestCommunitySurfaceImages(
      community.id,
      kind === 'community-profile-image' ? { profileImageId: imageId } : { bannerImageId: imageId },
    )
    selector = { surfaceKind: kind, communityId: community.id, imageId, hostedUseUrl }
    scope = { communityId: community.id, surfaceKind: kind }
    ownerId = community.id
    ownerKind = 'community'
    detach = () =>
      setTestCommunitySurfaceImages(
        community.id,
        kind === 'community-profile-image' ? { profileImageId: null } : { bannerImageId: null },
      )
  }
  const [placement] = await getTestImageSurfacePlacements(scope)
  if (!placement) throw new Error(`${kind} placement missing`)
  return {
    selector,
    imageId,
    placementId: placement.placement_id,
    placementRevision: placement.placement_revision,
    ownerId,
    actorUserId: owner.id,
    ownerKind,
    detach,
  }
}
type Fixture = TestCopyrightImageFixture
export async function createTestCopyrightRestrictionForImage(fixture: Fixture, at = new Date()) {
  const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
  const resolved = await resolveCopyrightImagePlacement(fixture.selector)
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: at,
    claimantUserId: null,
    claimantDisplayName: 'Test claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `Test work ${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'staff',
      bodyCiphertext: `body-${crypto.randomUUID()}`,
    },
    targets: [resolved],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Copyright case missing')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: at,
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    assessmentId: assessment.id,
    imposedAt: at,
    imposedById: null,
  })
  const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
  const withholdIntent = restricted?.actionIntents.find(intent => intent.action === 'withhold')
  if (!withholdIntent) throw new Error('Copyright withhold intent missing')
  return {
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    restrictionId: restriction.id,
    moderator,
    withholdIntentId: withholdIntent.id,
  }
}
