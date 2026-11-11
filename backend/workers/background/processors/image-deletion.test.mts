import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  IMAGE_DELETION_RECOVER_JOB,
  type ImageDeletionRecoveryData,
} from '@queues/background/enqueues/image-deletion-jobs'
import { background } from '@queues/background/queues'
import { deleteImageById, processImageDeletionPage } from '@services/images/delete'
import { getImageByIdFromPrimary } from '@services/images/get'
import {
  countPostImageRevisions,
  overrideDynamicConfigFieldsForTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import {
  createImageDeletionFixture,
  failingImageDeletionTransaction,
} from '@voucha/test-helpers/image-deletion'
import { seedOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { processImageDeletionRecovery } from './image-deletion.mts'

describe('image deletion recovery dispatcher', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('continues beyond an unfinished front image and converges after the admitted deletions finish', async context => {
    const fixtures = [await createImageDeletionFixture(1), await createImageDeletionFixture(1)]
    const imageIds = fixtures.map(fixture => fixture.imageId).toSorted()
    const images = await Promise.all(imageIds.map(id => getImageByIdFromPrimary(id)))
    const storage = await seedOwnedUploadCleanupStorage(
      images.flatMap(image => [image!.id, image!.s3_key, image!.sha_256!.toString('hex')]),
    )
    context.onTestFinished(
      overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
        images_page_size: 1,
        background_max_depth: 1000000,
      }),
    )
    for (const imageId of imageIds) {
      await expect(
        deleteImageById(imageId, { beginTransaction: failingImageDeletionTransaction() }),
      ).rejects.toThrow('injected middle deletion page failure')
    }
    const data: ImageDeletionRecoveryData = { imageIds }
    // The in-memory queue numbers jobs per process, but the page fences live in the shared
    // Valkey under the job id; an owned id keeps another process's "1" from sharing them.
    const job = await background.add(IMAGE_DELETION_RECOVER_JOB.name, data, {
      ...IMAGE_DELETION_RECOVER_JOB.options,
      jobId: `image-deletion-recovery-${randomUUID()}`,
    })
    if (!job) throw new Error('Owned recovery dispatcher was not admitted')
    await expect(processImageDeletionRecovery(Object.assign(job, { data }))).resolves.toBe(1)
    await expect(
      background.getJob(`image-deletion-${imageIds[0]!}-start-pending`),
    ).resolves.toMatchObject({
      data: { imageId: imageIds[0], cursor: null },
    })
    const nextData: ImageDeletionRecoveryData = {
      imageIds,
      afterId: imageIds[0],
      throughId: imageIds[1],
    }
    const next = (await readAllQueueJobs(background)).find(
      candidate =>
        candidate.name === IMAGE_DELETION_RECOVER_JOB.name &&
        (candidate.data as ImageDeletionRecoveryData).afterId === imageIds[0],
    )
    expect(next).toMatchObject({ data: nextData })
    if (!next) throw new Error('Owned recovery continuation was not admitted')
    // The first image is still unfinished: the continuation must nevertheless reach the second.
    await expect(
      processImageDeletionRecovery(Object.assign(next, { data: nextData })),
    ).resolves.toBe(1)
    await expect(
      background.getJob(`image-deletion-${imageIds[1]!}-start-pending`),
    ).resolves.toMatchObject({
      data: { imageId: imageIds[1], cursor: null },
    })
    for (const fixture of fixtures) {
      await processImageDeletionPage(fixture.imageId)
      await expect(countPostImageRevisions(fixture.postIds[0]!)).resolves.toBe(1)
    }
    // Both deletions finished their storage cleanup; store those objects again so any repeated
    // cleanup below would remove them.
    for (const imageId of imageIds)
      expect(await storage.deleted()).toContainEqual({
        Bucket: storage.buckets.images,
        Key: imageId,
      })
    await storage.restock()
    await processImageDeletionPage(randomUUID())
    await expect(storage.deleted()).resolves.toEqual([])
    const converged = await background.add(IMAGE_DELETION_RECOVER_JOB.name, data, {
      ...IMAGE_DELETION_RECOVER_JOB.options,
      jobId: `image-deletion-recovery-${randomUUID()}`,
    })
    if (!converged) throw new Error('Owned convergence dispatcher was not admitted')
    await expect(processImageDeletionRecovery(Object.assign(converged, { data }))).resolves.toBe(0)
    await expect(storage.deleted()).resolves.toEqual([])
    await expect(
      Promise.all(fixtures.map(fixture => countPostImageRevisions(fixture.postIds[0]!))),
    ).resolves.toEqual([1, 1])
  })
})
