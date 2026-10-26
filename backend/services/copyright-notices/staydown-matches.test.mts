import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as imageEnqueues from '@queues/content-analysis/enqueues/image-jobs'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import {
  readCopyrightStaydownEntries,
  readCopyrightStaydownMatches,
  readCopyrightStaydownMatchesForImage,
} from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { createRestrictedStaydownCase } from '@voucha/test-helpers/services/copyright-notices/staydown-fixture'
import {
  enableStaydownMatchingForTest,
  useStaydownMatching,
} from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import {
  enqueueCopyrightStaydownUploadMatch,
  fillCopyrightStaydownEntryHash,
  recordCopyrightStaydownExactMatch,
  recordCopyrightStaydownPerceptualMatches,
} from './staydown-matches.mts'

/**
 * A fresh random 64-bit hash per test: the shared test database keeps earlier runs' registry
 * entries, so a fixed hash would match them too.
 */
function randomHash(): string {
  return [...randomBytes(8)].map(byte => byte.toString(2).padStart(8, '0')).join('')
}

/** Flips the first `bits` bits, giving a hash exactly that many bits away from `hash`. */
function flipBits(hash: string, bits: number): string {
  return hash
    .split('')
    .map((bit, index) => (index < bits ? (bit === '1' ? '0' : '1') : bit))
    .join('')
}

/** A confirmed case registered while the switch was on; the caller decides the switch state after. */
async function createRegisteredCase() {
  const restore = await enableStaydownMatchingForTest()
  try {
    const staydownCase = await createRestrictedStaydownCase()
    return { ...staydownCase, imageId: staydownCase.imageIds[0]! }
  } finally {
    restore()
  }
}

describe('copyright staydown matching', () => {
  beforeEach(() => {
    vi.spyOn(imageEnqueues, 'enqueueStaydownHash').mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('copyright staydown matching with the switch off', () => {
    it('records no match, fills no hash, and queues no hashing', async () => {
      const registeredHash = randomHash()
      const staydownCase = await createRegisteredCase()
      // Registering the case queued its own hash job; only what the off switch queues counts.
      vi.mocked(imageEnqueues.enqueueStaydownHash).mockClear()
      await expect(
        fillCopyrightStaydownEntryHash({
          imageId: staydownCase.imageId,
          perceptualHash: registeredHash,
        }),
      ).resolves.toBe(false)
      const uploader = await createTestUser()
      const uploadId = await insertTestImage(uploader.id)

      await expect(
        recordCopyrightStaydownExactMatch({
          imageId: staydownCase.imageId,
          uploadedById: uploader.id,
        }),
      ).resolves.toBe(0)
      await expect(
        recordCopyrightStaydownPerceptualMatches({
          imageId: uploadId,
          perceptualHash: registeredHash,
        }),
      ).resolves.toBe(0)
      await enqueueCopyrightStaydownUploadMatch(uploadId)

      expect(await readCopyrightStaydownMatches(staydownCase.noticeId)).toEqual([])
      expect(imageEnqueues.enqueueStaydownHash).not.toHaveBeenCalled()
    })
  })

  describe('copyright staydown exact matching', () => {
    useStaydownMatching()

    it('records a re-upload of confirmed bytes once per uploader', async () => {
      const staydownCase = await createRegisteredCase()
      const [first, second] = await Promise.all([createTestUser(), createTestUser()])

      await expect(
        recordCopyrightStaydownExactMatch({
          imageId: staydownCase.imageId,
          uploadedById: first.id,
        }),
      ).resolves.toBe(1)
      await expect(
        recordCopyrightStaydownExactMatch({
          imageId: staydownCase.imageId,
          uploadedById: first.id,
        }),
      ).resolves.toBe(0)
      await expect(
        recordCopyrightStaydownExactMatch({
          imageId: staydownCase.imageId,
          uploadedById: second.id,
        }),
      ).resolves.toBe(1)

      const matches = await readCopyrightStaydownMatches(staydownCase.noticeId)
      expect(matches).toHaveLength(2)
      expect(matches.map(match => match.uploaded_by_id).toSorted()).toEqual(
        [first.id, second.id].toSorted(),
      )
      expect(matches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            image_id: staydownCase.imageId,
            match_kind: 'exact',
            hamming_distance: 0,
            reviewed_at: null,
          }),
        ]),
      )
    })

    it('ignores bytes that no confirmed restriction registered', async () => {
      const uploader = await createTestUser()
      const unrelatedId = await insertTestImage(uploader.id)

      await expect(
        recordCopyrightStaydownExactMatch({ imageId: unrelatedId, uploadedById: uploader.id }),
      ).resolves.toBe(0)
      expect(await readCopyrightStaydownMatchesForImage(unrelatedId)).toEqual([])
    })

    it('queues near-duplicate hashing for a new upload', async () => {
      await enqueueCopyrightStaydownUploadMatch('image-1')

      expect(imageEnqueues.enqueueStaydownHash).toHaveBeenCalledWith('image-1', 'upload')
    })
  })

  describe('copyright staydown perceptual matching', () => {
    useStaydownMatching()

    it('stores the registered hash once and never overwrites it', async () => {
      const registeredHash = randomHash()
      const staydownCase = await createRegisteredCase()

      await expect(
        fillCopyrightStaydownEntryHash({
          imageId: staydownCase.imageId,
          perceptualHash: registeredHash,
        }),
      ).resolves.toBe(true)
      await expect(
        fillCopyrightStaydownEntryHash({
          imageId: staydownCase.imageId,
          perceptualHash: flipBits(registeredHash, 20),
        }),
      ).resolves.toBe(false)
    })

    it('matches an upload within the documented distance and not beyond it', async () => {
      const registeredHash = randomHash()
      const staydownCase = await createRegisteredCase()
      const [registeredEntry] = await readCopyrightStaydownEntries(staydownCase.noticeId)
      if (!registeredEntry) throw new Error('registered staydown entry missing')
      await fillCopyrightStaydownEntryHash({
        imageId: staydownCase.imageId,
        perceptualHash: registeredHash,
      })
      const uploader = await createTestUser()
      const [near, far] = await Promise.all([
        insertTestImage(uploader.id),
        insertTestImage(uploader.id),
      ])

      await recordCopyrightStaydownPerceptualMatches({
        imageId: near,
        perceptualHash: flipBits(registeredHash, 8),
      })
      await recordCopyrightStaydownPerceptualMatches({
        imageId: far,
        perceptualHash: flipBits(registeredHash, 9),
      })

      const ownedMatches = (await readCopyrightStaydownMatches(staydownCase.noticeId)).filter(
        match => match.copyright_staydown_entry_id === registeredEntry.id,
      )
      expect(ownedMatches.filter(match => match.image_id === far)).toEqual([])
      expect(ownedMatches.filter(match => match.image_id === near)).toEqual([
        expect.objectContaining({
          match_kind: 'perceptual',
          hamming_distance: 8,
          uploaded_by_id: uploader.id,
          reviewed_at: null,
        }),
      ])
      await recordCopyrightStaydownPerceptualMatches({
        imageId: near,
        perceptualHash: flipBits(registeredHash, 8),
      })
      expect(
        (await readCopyrightStaydownMatches(staydownCase.noticeId)).filter(
          match =>
            match.copyright_staydown_entry_id === registeredEntry.id && match.image_id === near,
        ),
      ).toHaveLength(1)
    })

    it('never matches a registered image against itself or against an entry still unhashed', async () => {
      const registeredHash = randomHash()
      const hashed = await createRegisteredCase()
      const unhashed = await createRegisteredCase()
      const [hashedEntry] = await readCopyrightStaydownEntries(hashed.noticeId)
      const [unhashedEntry] = await readCopyrightStaydownEntries(unhashed.noticeId)
      if (!hashedEntry || !unhashedEntry) throw new Error('registered staydown entry missing')
      await fillCopyrightStaydownEntryHash({
        imageId: hashed.imageId,
        perceptualHash: registeredHash,
      })

      await recordCopyrightStaydownPerceptualMatches({
        imageId: hashed.imageId,
        perceptualHash: registeredHash,
      })
      await recordCopyrightStaydownPerceptualMatches({
        imageId: unhashed.imageId,
        perceptualHash: registeredHash,
      })
      expect(
        (await readCopyrightStaydownMatchesForImage(hashed.imageId)).filter(
          match => match.copyright_staydown_entry_id === hashedEntry.id,
        ),
      ).toEqual([])
      expect(
        (await readCopyrightStaydownMatchesForImage(unhashed.imageId)).filter(
          match => match.copyright_staydown_entry_id === hashedEntry.id,
        ),
      ).toHaveLength(1)
      expect(
        (await readCopyrightStaydownMatches(unhashed.noticeId)).filter(
          match => match.copyright_staydown_entry_id === unhashedEntry.id,
        ),
      ).toEqual([])
    })
  })
})
