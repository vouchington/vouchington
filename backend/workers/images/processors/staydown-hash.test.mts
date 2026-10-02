import { Readable } from 'node:stream'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as imageEnqueues from '@queues/images/enqueues'
import { copyrightStaydownMaxHammingDistance } from '@services/copyright-notices/staydown-matches'
import { getImageByIdFromPrimary } from '@services/images/get'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import {
  readCopyrightStaydownEntries,
  readCopyrightStaydownMatches,
  readCopyrightStaydownMatchesForImage,
} from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import {
  createStaydownNearDuplicate,
  createStaydownPatternImage,
} from '@voucha/test-helpers/staydown-pattern-image'
import { createRestrictedStaydownCase } from '@voucha/test-helpers/services/copyright-notices/staydown-fixture'
import {
  enableStaydownMatchingForTest,
  useStaydownMatching,
} from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { type ProcessStaydownHashDeps, processStaydownHash } from './staydown-hash.mts'

/** A random seed per test: the shared test database keeps earlier runs' registry entries. */
function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

/** A world where S3 holds whatever bytes the test stored under an image's key. */
function createWorld() {
  const objects = new Map<string, Buffer>()
  const getImageFromS3 = vi.fn<ProcessStaydownHashDeps['getImageFromS3']>(async (_env, key) => ({
    $metadata: {},
    Body: Readable.from([objects.get(key)!]) as never,
  }))
  return {
    getImageFromS3,
    hash: (imageId: string) => processStaydownHash(imageId, { getImageFromS3 }),
    async store(imageId: string, bytes: Buffer) {
      const image = await getImageByIdFromPrimary(imageId)
      objects.set(image!.s3_key!, bytes)
    },
  }
}

/** A case whose one registered image holds `bytes` in the world's S3. */
async function createRegisteredImage(world: ReturnType<typeof createWorld>, bytes: Buffer) {
  const staydownCase = await createRestrictedStaydownCase()
  const imageId = staydownCase.imageIds[0]!
  await world.store(imageId, bytes)
  return { ...staydownCase, imageId }
}

async function createUpload(world: ReturnType<typeof createWorld>, bytes: Buffer) {
  const uploader = await createTestUser()
  const uploadId = await insertTestImage(uploader.id)
  await world.store(uploadId, bytes)
  return { uploader, uploadId }
}

describe('staydown hash job', () => {
  beforeEach(() => {
    vi.spyOn(imageEnqueues, 'enqueueStaydownHash').mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('staydown hash job with the switch off', () => {
    it('reads no bytes and records nothing, even for a registered image', async () => {
      const world = createWorld()
      const seed = randomSeed()
      const restore = await enableStaydownMatchingForTest()
      const registered = await createRegisteredImage(world, await createStaydownPatternImage(seed))
      const upload = await createUpload(world, await createStaydownPatternImage(seed))
      restore()

      await world.hash(registered.imageId)
      await world.hash(upload.uploadId)

      expect(world.getImageFromS3).not.toHaveBeenCalled()
      const [entry] = await readCopyrightStaydownEntries(registered.noticeId)
      expect(entry?.perceptual_hash).toBeNull()
      expect(await readCopyrightStaydownMatchesForImage(upload.uploadId)).toEqual([])
    })
  })

  describe('staydown hash job with the switch on', () => {
    useStaydownMatching()

    it('stores the perceptual hash of a registered image and never matches it against itself', async () => {
      const world = createWorld()
      const registered = await createRegisteredImage(
        world,
        await createStaydownPatternImage(randomSeed()),
      )

      await world.hash(registered.imageId)

      const [entry] = await readCopyrightStaydownEntries(registered.noticeId)
      expect(entry?.perceptual_hash).toMatch(/^[01]{64}$/)
      expect(await readCopyrightStaydownMatches(registered.noticeId)).toEqual([])
    })

    it('sends a re-encoded, resized copy of a confirmed image to staff review exactly once', async () => {
      const world = createWorld()
      const original = await createStaydownPatternImage(randomSeed())
      const registered = await createRegisteredImage(world, original)
      await world.hash(registered.imageId)
      const upload = await createUpload(world, await createStaydownNearDuplicate(original))

      await world.hash(upload.uploadId)
      await world.hash(upload.uploadId)

      const matches = await readCopyrightStaydownMatches(registered.noticeId)
      expect(matches).toEqual([
        expect.objectContaining({
          image_id: upload.uploadId,
          uploaded_by_id: upload.uploader.id,
          match_kind: 'perceptual',
          reviewed_at: null,
        }),
      ])
      expect(matches[0]!.hamming_distance).toBeLessThanOrEqual(copyrightStaydownMaxHammingDistance)
    })

    it('matches an upload that arrived before the registered image was hashed', async () => {
      const world = createWorld()
      const original = await createStaydownPatternImage(randomSeed())
      const registered = await createRegisteredImage(world, original)
      const upload = await createUpload(world, await createStaydownNearDuplicate(original))
      await world.hash(upload.uploadId)
      expect(await readCopyrightStaydownMatches(registered.noticeId)).toEqual([])

      // Hashing the registered image only fills its entry; the upload's job, which the hourly
      // reconciliation replays, is what finds the match once the entry has a hash.
      await world.hash(registered.imageId)
      expect(await readCopyrightStaydownMatches(registered.noticeId)).toEqual([])
      await world.hash(upload.uploadId)

      expect(await readCopyrightStaydownMatches(registered.noticeId)).toHaveLength(1)
    })

    it('does not match an unrelated image', async () => {
      const world = createWorld()
      const seed = randomSeed()
      const registered = await createRegisteredImage(world, await createStaydownPatternImage(seed))
      await world.hash(registered.imageId)
      const upload = await createUpload(world, await createStaydownPatternImage(seed + 1))

      await world.hash(upload.uploadId)

      expect(await readCopyrightStaydownMatchesForImage(upload.uploadId)).toEqual([])
    })

    it('does nothing for a flat image, which identifies nothing', async () => {
      const world = createWorld()
      const registered = await createRegisteredImage(
        world,
        await createStaydownPatternImage(randomSeed()),
      )
      await world.hash(registered.imageId)
      const flat = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#808080' },
      })
        .png()
        .toBuffer()
      const upload = await createUpload(world, flat)

      await world.hash(upload.uploadId)

      expect(await readCopyrightStaydownMatchesForImage(upload.uploadId)).toEqual([])
    })
  })
})
