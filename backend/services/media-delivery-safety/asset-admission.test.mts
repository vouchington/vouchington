import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WEB_PROVENANCE,
  beginTransaction,
  createTestUserDirect,
  insertTestImage,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers'
import {
  createTestDeliverySavepoint,
  rollbackTestDeliverySavepoint,
  withTestDeliveryBorrowedClient,
  withTestDeliveryReusedClient,
  flagTestDeliveryImageInTransaction,
  setTestDeliveryUserImageInTransaction,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  lockImageAssetAdmission,
  lockImageDeliveryMutation,
  prepublishImageDeliveryDenials,
  getImagePlacementDeliveryKey,
  processMediaDeliveryRegistryRecord,
  assertImagesReadyForSurface,
  lockUserProfileLinkImageOwners,
} from './index.mts'
import * as assetAdmissionLock from './asset-admission-lock.mts'
import { syncImageSurfacePlacement } from './surface-placement-sync.mts'
import { createCommunity } from '../communities/create.mts'
import { lockActivePostAuthorImageAdmission } from '../posts/create/active-author.mts'

describe('asset admission root domain', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rejects admission roots after a readiness row lock even through a borrowed wrapper', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await using query = await beginTransaction()
    await assertImagesReadyForSurface([imageId], query)
    await withTestDeliveryBorrowedClient(query, async borrowed => {
      await expect(lockImageAssetAdmission([imageId], borrowed)).rejects.toThrow('Declare all')
    })
  })

  it('does not permit a later image root after preparing an empty-image author scope', async () => {
    const user = await createTestUserDirect()
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'false')
    await using query = await beginTransaction()
    await lockActivePostAuthorImageAdmission(query, user.id, [])
    await expect(lockImageAssetAdmission([crypto.randomUUID()], query)).rejects.toThrow(
      'Declare all',
    )
  })

  it('serializes owner UUID aliases through the same canonical surface identity', async () => {
    const ownerId = crypto.randomUUID()
    await using first = await beginTransaction()
    await using second = await beginTransaction()
    await lockUserProfileLinkImageOwners([ownerId], first)
    await second(`SET LOCAL lock_timeout = '50ms'`)
    await expect(
      lockUserProfileLinkImageOwners([ownerId.replaceAll('-', '').toUpperCase()], second),
    ).rejects.toMatchObject({ code: '55P03' })
    await second.rollback()
    await first.rollback()
    await using retry = await beginTransaction()
    await lockUserProfileLinkImageOwners([ownerId.replaceAll('-', '').toUpperCase()], retry)
  })

  it('shares immutable roots across borrowed wrappers and rejects late expansion before publication', async () => {
    await using transaction = await beginTransaction()
    const a = crypto.randomUUID(),
      b = crypto.randomUUID()
    const edge = installTestMediaDeliveryEdge()
    await lockImageAssetAdmission([b, a], transaction)
    await withTestDeliveryBorrowedClient(transaction, query => lockImageAssetAdmission([a], query))
    await lockImageDeliveryMutation(transaction, { placementOnly: true })
    await withTestDeliveryBorrowedClient(transaction, async query => {
      await expect(lockImageAssetAdmission([crypto.randomUUID()], query)).rejects.toThrow(
        'Declare all',
      )
      await lockImageAssetAdmission([b], query)
    })
    expect(edge.put).not.toHaveBeenCalled()
  })

  it('rejects a second root batch even before narrower authority starts', async () => {
    await using transaction = await beginTransaction()
    await lockImageAssetAdmission([crypto.randomUUID()], transaction)
    await expect(lockImageAssetAdmission([crypto.randomUUID()], transaction)).rejects.toThrow(
      'Declare all',
    )
  })

  it('rewinds roots and narrower authority with a real savepoint rollback', async () => {
    await using transaction = await beginTransaction()
    const a = crypto.randomUUID(),
      b = crypto.randomUUID()
    await createTestDeliverySavepoint(transaction)
    await lockImageAssetAdmission([a], transaction)
    await lockImageDeliveryMutation(transaction, { placementOnly: true })
    await rollbackTestDeliverySavepoint(transaction)
    await lockImageAssetAdmission([b], transaction)
    await lockImageDeliveryMutation(transaction, { placementOnly: true })
    await expect(lockImageAssetAdmission([a], transaction)).rejects.toThrow('Declare all')
  })

  it('resets roots after commit and rollback on the same physical borrowed client', async () => {
    await withTestDeliveryReusedClient(async run => {
      await run(async query => {
        await lockImageAssetAdmission([crypto.randomUUID()], query)
        await lockImageDeliveryMutation(query, { placementOnly: true })
      })
      await expect(
        run(async query => {
          await lockImageAssetAdmission([crypto.randomUUID()], query)
          await lockImageDeliveryMutation(query, { placementOnly: true })
          throw new Error('rollback probe')
        }),
      ).rejects.toThrow('rollback probe')
      await run(async query => {
        await lockImageAssetAdmission([crypto.randomUUID()], query)
        await lockImageDeliveryMutation(query, { placementOnly: true })
      })
    })
  })

  it.each(['sync', 'community-create'] as const)(
    'blocks %s new binding behind uncommitted unsafe admission and rereads readiness',
    async path => {
      const user = await createTestUserDirect()
      const imageId = await insertTestImage(user.id)
      const edge = installTestMediaDeliveryEdge()
      await using unsafe = await beginTransaction()
      await using owner = await beginTransaction()
      await lockImageAssetAdmission([imageId], unsafe)
      await lockImageDeliveryMutation(unsafe, { imageIds: [imageId] })
      await flagTestDeliveryImageInTransaction(unsafe, imageId)
      const blocked = watchAdmissionLock(ids => ids.includes(imageId))
      const admitting = (
        path === 'sync'
          ? syncImageSurfacePlacement(
              { surfaceKind: 'user-profile-image', userId: user.id },
              imageId,
              user.id,
              owner,
            )
          : createCommunity(user.id, WEB_PROVENANCE, {
              name: `Admission barrier community ${crypto.randomUUID()}`,
              profile_image_id: imageId,
            })
      ).then(
        () => null,
        err => err as Error,
      )
      try {
        await blocked.promise
        await expectAdmissionLockHeld(imageId)
        expect(edge.put).not.toHaveBeenCalled()
      } finally {
        await unsafe.commit()
        await admitting
      }
      await expect(
        admitting.then(error => {
          if (error) throw error
          throw new Error('Expected readiness rejection')
        }),
      ).rejects.toThrow('not ready')
      expect(edge.put).not.toHaveBeenCalled()
      expect(await getTestImageSurfacePlacements({ imageId })).toEqual([])
    },
  )

  it('makes a waiting unsafe writer discover and deny the newly committed binding', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const edge = installTestMediaDeliveryEdge()
    await using owner = await beginTransaction()
    await using unsafe = await beginTransaction()
    await lockImageAssetAdmission([imageId], owner)
    const tuple = await syncImageSurfacePlacement(
      { surfaceKind: 'user-profile-image', userId: user.id },
      imageId,
      user.id,
      owner,
    )
    await setTestDeliveryUserImageInTransaction(owner, user.id, imageId)
    const key = getImagePlacementDeliveryKey({
      placementId: tuple!.placement_id,
      revision: tuple!.placement_revision,
      imageId,
    })
    const admissionStarted = Promise.withResolvers<void>()
    const modifying = (async () => {
      const pending = lockImageAssetAdmission([imageId], unsafe)
      admissionStarted.resolve()
      await pending
      await lockImageDeliveryMutation(unsafe, { imageIds: [imageId] })
      await prepublishImageDeliveryDenials(imageId, { query: unsafe })
      await flagTestDeliveryImageInTransaction(unsafe, imageId)
      await unsafe.commit()
    })()
    void modifying.catch(() => undefined)
    try {
      await admissionStarted.promise
      await expectAdmissionLockHeld(imageId)
    } finally {
      await owner.commit()
      await Promise.allSettled([modifying])
    }
    await expect(modifying).resolves.toBeUndefined()
    expect(edge.records.get(key)?.state).toBe('withheld')
    await processMediaDeliveryRegistryRecord(key)
    expect(edge.records.get(key)?.state).toBe('withheld')
  })

  it('uses the same root for uppercase UUID aliases and reacquires it after client reuse', async () => {
    const imageId = crypto.randomUUID()
    await using blocker = await beginTransaction()
    await lockImageAssetAdmission([imageId], blocker)
    const blocked = watchAdmissionLock(ids => ids.some(id => id === imageId.toUpperCase()))
    const reusing = withTestDeliveryReusedClient(async run => {
      await run(async query => {
        await lockImageAssetAdmission([crypto.randomUUID()], query)
        await lockImageDeliveryMutation(query, { placementOnly: true })
      })
      await run(async query => {
        await lockImageAssetAdmission([imageId.toUpperCase()], query)
        await lockImageAssetAdmission([imageId], query)
      })
    })
    void reusing.catch(() => undefined)
    try {
      await blocked.promise
      await expectAdmissionLockHeld(imageId)
    } finally {
      await blocker.rollback()
      await Promise.allSettled([reusing])
    }
    await expect(reusing).resolves.toBeUndefined()
  })
})

function watchAdmissionLock(matches: (imageIds: readonly string[]) => boolean): Promise<void> {
  const blocked = Promise.withResolvers<void>()
  const lockAdmission = assetAdmissionLock.lockImageAssetAdmission
  let armed = false
  vi.spyOn(assetAdmissionLock, 'lockImageAssetAdmission').mockImplementation((imageIds, query) => {
    if (armed || !matches(imageIds)) return lockAdmission(imageIds, query)
    armed = true
    const pending = lockAdmission(imageIds, query)
    blocked.resolve()
    return pending
  })
  return blocked.promise
}

async function expectAdmissionLockHeld(imageId: string): Promise<void> {
  await using probe = await beginTransaction()
  await probe(`SET LOCAL lock_timeout = '50ms'`)
  await expect(
    probe(`/* admission lock probe */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `image-asset-admission:${imageId}`,
    ]),
  ).rejects.toMatchObject({ code: '55P03' })
}
