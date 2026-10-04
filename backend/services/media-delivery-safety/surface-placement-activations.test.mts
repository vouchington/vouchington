import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  deleteTestImageSurfacePlacementActivation,
  getTestImageSurfacePlacementActivations,
  getTestImageSurfacePlacements,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestImage,
  insertTestTopic,
  reactivateTestUserProfileImageThroughDatabaseTrigger,
  setTestTopicSurfaceImages,
  setTestUserProfileImage,
  updateTestImageSurfacePlacementActivation,
} from '@voucha/test-helpers'
import { removeTestUserRole } from '@voucha/test-helpers/entities/user-role-removal'
import { updateCommunity } from '../communities/update.mts'
import { syncImageSurfacePlacement } from './surface-placement-sync.mts'

describe('image surface placement activation provenance', () => {
  it('captures different uploader and administrator setter identities as immutable facts', async () => {
    const [uploader, owner, administrator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect({ administrator: true }),
    ])
    const imageId = await insertTestImage(uploader.id)
    const community = await insertTestCommunity({ createdById: owner.id })

    await updateCommunity(administrator, community.id, { profile_image_id: imageId })

    const [placement] = await getTestImageSurfacePlacements({
      communityId: community.id,
      surfaceKind: 'community-profile-image',
    })
    expect(placement).toBeDefined()
    const activations = await getTestImageSurfacePlacementActivations(placement!.placement_id)
    expect(activations).toEqual([
      expect.objectContaining({
        placement_id: placement!.placement_id,
        surface_kind: 'community-profile-image',
        placement_revision: placement!.placement_revision,
        bound_by_user_id: administrator.id,
        uploaded_by_user_id: uploader.id,
        bound_by_administrator: true,
        bound_at: expect.any(Date),
      }),
    ])

    await removeTestUserRole(administrator.id, 'administrator')
    await expect(
      getTestImageSurfacePlacementActivations(placement!.placement_id),
    ).resolves.toMatchObject([{ bound_by_user_id: administrator.id, bound_by_administrator: true }])
  })

  it('records a community owner moderator as a non-administrator setter', async () => {
    const [creator, moderator, uploader] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect({ extraRoles: ['moderator'] }),
      createTestUserDirect(),
    ])
    const community = await insertTestCommunity({ createdById: creator.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'owner',
    })
    const imageId = await insertTestImage(uploader.id)

    await updateCommunity(moderator, community.id, { banner_image_id: imageId }, membership)

    const [placement] = await getTestImageSurfacePlacements({
      communityId: community.id,
      surfaceKind: 'community-banner-image',
    })
    expect(placement).toBeDefined()
    await expect(
      getTestImageSurfacePlacementActivations(placement!.placement_id),
    ).resolves.toMatchObject([
      {
        bound_by_user_id: moderator.id,
        uploaded_by_user_id: uploader.id,
        bound_by_administrator: false,
      },
    ])
  })

  it.each([['user-profile-image', 'user'] as const, ['topic-logo-image', 'topic'] as const])(
    'stores a null administrator snapshot for %s',
    async (surfaceKind, ownerKind) => {
      const owner = await createTestUserDirect({ administrator: true })
      const uploader = ownerKind === 'user' ? owner : await createTestUserDirect()
      const imageId = await insertTestImage(uploader.id)
      let placementId: string
      if (ownerKind === 'user') {
        await setTestUserProfileImage(owner.id, imageId)
        const [placement] = await getTestImageSurfacePlacements({ userId: owner.id, surfaceKind })
        placementId = placement?.placement_id ?? ''
      } else {
        const suffix = crypto.randomUUID()
        const topicId = await insertTestTopic({
          name: `activation-${suffix}`,
          slug: `activation-${suffix}`,
          createdById: owner.id,
        })
        await setTestTopicSurfaceImages(topicId, { logoImageId: imageId })
        const [placement] = await getTestImageSurfacePlacements({ topicId, surfaceKind })
        placementId = placement?.placement_id ?? ''
      }

      expect(placementId).not.toBe('')

      await expect(getTestImageSurfacePlacementActivations(placementId)).resolves.toMatchObject([
        {
          surface_kind: surfaceKind,
          bound_by_user_id: owner.id,
          uploaded_by_user_id: uploader.id,
          bound_by_administrator: null,
        },
      ])
    },
  )

  it('requires an actor for a non-null application activation', async () => {
    const owner = await createTestUserDirect()
    const imageId = await insertTestImage(owner.id)
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `activation-${suffix}`,
      slug: `activation-${suffix}`,
      createdById: owner.id,
    })

    await using transaction = await beginTransaction()
    await expect(
      syncImageSurfacePlacement(
        { surfaceKind: 'topic-logo-image', topicId },
        imageId,
        null,
        transaction,
      ),
    ).rejects.toThrow('An image surface activation requires an actor')
    await expect(getTestImageSurfacePlacements({ topicId })).resolves.toEqual([])
  })

  it('writes a new application activation after reactivation but none for a same-image no-op', async () => {
    const owner = await createTestUserDirect()
    const imageId = await insertTestImage(owner.id)
    await setTestUserProfileImage(owner.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({
      userId: owner.id,
      surfaceKind: 'user-profile-image',
    })
    expect(placement).toBeDefined()

    const initial = await getTestImageSurfacePlacementActivations(placement!.placement_id)
    await setTestUserProfileImage(owner.id, imageId)
    await expect(getTestImageSurfacePlacementActivations(placement!.placement_id)).resolves.toEqual(
      initial,
    )

    await setTestUserProfileImage(owner.id, null)
    await setTestUserProfileImage(owner.id, imageId)
    const reactivated = await getTestImageSurfacePlacementActivations(placement!.placement_id)
    expect(reactivated).toHaveLength(2)
    expect(reactivated[0]).toEqual(initial[0])
    expect(reactivated[1]).toMatchObject({
      placement_id: placement!.placement_id,
      bound_by_user_id: owner.id,
      uploaded_by_user_id: owner.id,
      bound_by_administrator: null,
    })
    expect(reactivated[1]!.placement_revision).toBeGreaterThan(reactivated[0]!.placement_revision)
  })

  it('does not invent a binder when only the database trigger reactivates a placement', async () => {
    const owner = await createTestUserDirect()
    const imageId = await insertTestImage(owner.id)
    await setTestUserProfileImage(owner.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({
      userId: owner.id,
      surfaceKind: 'user-profile-image',
    })
    expect(placement).toBeDefined()
    const initial = await getTestImageSurfacePlacementActivations(placement!.placement_id)
    expect(initial).toHaveLength(1)

    await reactivateTestUserProfileImageThroughDatabaseTrigger(owner.id, imageId)

    const [reactivated] = await getTestImageSurfacePlacements({
      userId: owner.id,
      surfaceKind: 'user-profile-image',
    })
    expect(reactivated!.retired_at).toBeNull()
    expect(reactivated!.placement_revision).toBeGreaterThan(initial[0]!.placement_revision)
    await expect(getTestImageSurfacePlacementActivations(placement!.placement_id)).resolves.toEqual(
      initial,
    )
  })

  it('rejects update and delete of an activation row', async () => {
    const owner = await createTestUserDirect()
    const imageId = await insertTestImage(owner.id)
    await setTestUserProfileImage(owner.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({
      userId: owner.id,
      surfaceKind: 'user-profile-image',
    })
    expect(placement).toBeDefined()
    const [activation] = await getTestImageSurfacePlacementActivations(placement!.placement_id)
    expect(activation).toBeDefined()

    await expect(
      updateTestImageSurfacePlacementActivation(
        activation!.placement_id,
        activation!.placement_revision,
      ),
    ).rejects.toThrow('image placement bindings are immutable')
    await expect(
      deleteTestImageSurfacePlacementActivation(
        activation!.placement_id,
        activation!.placement_revision,
      ),
    ).rejects.toThrow('image placement bindings are immutable')
  })
})
