import { describe, expect, it, vi } from 'vitest'
import { PRIORITY_DEFAULT } from '@queues/images/config'
import * as imageEnqueues from '@queues/images/enqueues'
import { imagesQueue } from '@queues/images/queues'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { createRestrictedStaydownCase } from '@voucha/test-helpers/services/copyright-notices/staydown-fixture'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { getImageByIdFromPrimary } from '@services/images/get'
import { isCopyrightStaydownMatchingEnabled } from './config.mts'
import { completeCopyrightMandatoryHumanReview } from './index.mts'

/**
 * `imagesQueue` is `Queue<unknown>`. Read the image id only when the payload actually has one,
 * so a staydown-hash job with another shape cannot satisfy the registration dedup id.
 */
function registrationImageId(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('id' in data)) return undefined
  const { id } = data
  return typeof id === 'string' ? id : undefined
}

/**
 * The registration enqueue is fire-and-forget. Await the promise `enqueueStaydownHash` already
 * returns, then read the queue once. `searchJobs` is state-independent and scoped to this image.
 */
async function settledRegistration<T>(run: () => Promise<T>): Promise<T> {
  const pending: Promise<unknown>[] = []
  const enqueue = imageEnqueues.enqueueStaydownHash
  const spy = vi
    .spyOn(imageEnqueues, 'enqueueStaydownHash')
    .mockImplementation((imageId, source) => {
      const job = enqueue(imageId, source)
      pending.push(job)
      return job
    })
  try {
    const result = await run()
    await Promise.all(pending)
    return result
  } finally {
    spy.mockRestore()
  }
}

async function registrationHashJobs(imageIds: readonly string[]) {
  const groups = await Promise.all(
    imageIds.map(imageId =>
      imagesQueue.searchJobs({
        name: 'staydown-hash',
        data: { id: imageId },
      }),
    ),
  )
  return groups.flat().filter((job): job is typeof job & { data: { id: string } } => {
    const imageId = registrationImageId(job.data)
    return (
      imageId !== undefined &&
      job.opts.deduplication?.id === `staydown-hash-registration-${imageId}`
    )
  })
}

async function expectNoRegistrationHashJobs(imageIds: readonly string[]): Promise<void> {
  expect(await registrationHashJobs(imageIds)).toEqual([])
}

async function expectRegistrationHashJobs(imageIds: readonly string[]): Promise<void> {
  const jobs = await registrationHashJobs(imageIds)
  expect(jobs).toHaveLength(imageIds.length)
  expect(jobs.map(job => job.data.id).toSorted()).toEqual(imageIds.toSorted())
  for (const job of jobs) {
    expect(job.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `staydown-hash-registration-${job.data.id}`,
        mode: 'simple',
      },
    })
  }
}

describe('copyright staydown registration', () => {
  describe('copyright staydown registration with the switch off', () => {
    it('hashes and registers nothing when a moderator confirms a restriction', async () => {
      expect(await isCopyrightStaydownMatchingEnabled()).toBe(false)

      const staydownCase = await createRestrictedStaydownCase({ targetCount: 2 })

      expect(staydownCase.restrictions).toHaveLength(2)
      expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toEqual([])
      await expectNoRegistrationHashJobs(staydownCase.imageIds)
    })
  })

  describe('copyright staydown registration with the switch on', () => {
    useStaydownMatching()

    it('registers the exact digest of each moderator-confirmed image and queues its perceptual hash', async () => {
      const staydownCase = await settledRegistration(() =>
        createRestrictedStaydownCase({ targetCount: 2 }),
      )

      const entries = await readCopyrightStaydownEntries(staydownCase.noticeId)
      const images = await Promise.all(staydownCase.imageIds.map(id => getImageByIdFromPrimary(id)))
      expect(entries.map(entry => entry.image_id).toSorted()).toEqual(
        staydownCase.imageIds.toSorted(),
      )
      for (const entry of entries) {
        const image = images.find(candidate => candidate?.id === entry.image_id)
        expect(entry.sha_256.equals(image!.sha_256!)).toBe(true)
        expect(entry.perceptual_hash).toBeNull()
        expect(staydownCase.restrictions.map(restriction => restriction.id)).toContain(
          entry.copyright_restriction_id,
        )
      }
      await expectRegistrationHashJobs(staydownCase.imageIds)
    })

    it('does not register an automated restriction no moderator has reviewed', async () => {
      const staydownCase = await createRestrictedStaydownCase({ imposedBy: 'automation' })

      expect(staydownCase.restrictions[0]?.human_review_action).toBeNull()
      expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toEqual([])
      await expectNoRegistrationHashJobs(staydownCase.imageIds)
    })

    it.each([
      { action: 'confirm' as const, registers: true },
      { action: 'reverse' as const, registers: false },
    ])(
      'registers an automated restriction after mandatory review only when the moderator chose $action: $registers',
      async ({ action, registers }) => {
        const staydownCase = await createRestrictedStaydownCase({ imposedBy: 'automation' })

        await settledRegistration(() =>
          completeCopyrightMandatoryHumanReview({
            currentUser: staydownCase.moderator,
            noticeId: staydownCase.noticeId,
            restrictionId: staydownCase.restrictions[0]!.id,
            action,
            rationale: 'Reviewed the image against the claimed work.',
            reviewedAt: new Date('2026-07-01T13:00:00.000Z'),
          }),
        )

        const entries = await readCopyrightStaydownEntries(staydownCase.noticeId)
        expect(entries.map(entry => entry.image_id)).toEqual(registers ? staydownCase.imageIds : [])
        if (registers) await expectRegistrationHashJobs(staydownCase.imageIds)
        else await expectNoRegistrationHashJobs(staydownCase.imageIds)
      },
    )
  })
})
