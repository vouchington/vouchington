import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
  getTestDeliveryTransactionPid,
  testDeliveryTransactionIsBlockingAdmission,
  setTestDeliveryUserImageInTransaction,
  testDeliveryTransactionIsWaitingForLock,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  lockImageAssetAdmission,
  lockImageDeliveryMutation,
  prepublishImageDeliveryDenials,
  getImagePlacementDeliveryKey,
  processMediaDeliveryRegistryRecord,
  assertImagesReadyForSurface,
  lockImageSurfaceOwner,
} from './index.mts'
import { syncImageSurfacePlacement } from '../images/surface-placements.mts'
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
    await lockImageSurfaceOwner(
      { surfaceKind: 'user-profile-link-image', userProfileLinkId: ownerId },
      first,
    )
    const pid = await getTestDeliveryTransactionPid(second)
    const locking = lockImageSurfaceOwner(
      {
        surfaceKind: 'user-profile-link-image',
        userProfileLinkId: ownerId.replaceAll('-', '').toUpperCase(),
      },
      second,
    )
    void locking.catch(() => undefined)
    try {
      await vi.waitFor(async () =>
        expect(await testDeliveryTransactionIsWaitingForLock(pid)).toBe(true),
      )
    } finally {
      await first.rollback()
      await Promise.allSettled([locking])
    }
    await expect(locking).resolves.toBeUndefined()
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
      const pid = await getTestDeliveryTransactionPid(unsafe)
      const admitting = (
        path === 'sync'
          ? syncImageSurfacePlacement(
              { surfaceKind: 'user-profile-image', userId: user.id },
              imageId,
              owner,
            )
          : createCommunity(user.id, {
              name: `Admission barrier community ${crypto.randomUUID()}`,
              profile_image_id: imageId,
            })
      ).then(
        () => null,
        error => error as Error,
      )
      try {
        await vi.waitFor(async () =>
          expect(await testDeliveryTransactionIsBlockingAdmission(pid)).toBe(true),
        )
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
      owner,
    )
    await setTestDeliveryUserImageInTransaction(owner, user.id, imageId)
    const key = getImagePlacementDeliveryKey({
      placementId: tuple!.placement_id,
      revision: tuple!.placement_revision,
      imageId,
    })
    const pid = await getTestDeliveryTransactionPid(owner)
    const modifying = (async () => {
      await lockImageAssetAdmission([imageId], unsafe)
      await lockImageDeliveryMutation(unsafe, { imageIds: [imageId] })
      await prepublishImageDeliveryDenials(imageId, { query: unsafe })
      await flagTestDeliveryImageInTransaction(unsafe, imageId)
      await unsafe.commit()
    })()
    void modifying.catch(() => undefined)
    try {
      await vi.waitFor(async () =>
        expect(await testDeliveryTransactionIsBlockingAdmission(pid)).toBe(true),
      )
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
    const pid = await getTestDeliveryTransactionPid(blocker)
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
      await vi.waitFor(async () =>
        expect(await testDeliveryTransactionIsBlockingAdmission(pid)).toBe(true),
      )
    } finally {
      await blocker.rollback()
      await Promise.allSettled([reusing])
    }
    await expect(reusing).resolves.toBeUndefined()
  })
})
