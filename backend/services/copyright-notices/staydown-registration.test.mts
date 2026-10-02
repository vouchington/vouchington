import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as imageEnqueues from '@queues/images/enqueues'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { createRestrictedStaydownCase } from '@voucha/test-helpers/services/copyright-notices/staydown-fixture'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { getImageByIdFromPrimary } from '@services/images/get'
import { isCopyrightStaydownMatchingEnabled } from './config.mts'
import { completeCopyrightMandatoryHumanReview } from './index.mts'

let enqueueHash: MockInstance<typeof imageEnqueues.enqueueStaydownHash>

describe('copyright staydown registration', () => {
  beforeEach(() => {
    enqueueHash = vi
      .spyOn(imageEnqueues, 'enqueueStaydownHash')
      .mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('copyright staydown registration with the switch off', () => {
    it('hashes and registers nothing when a moderator confirms a restriction', async () => {
      expect(await isCopyrightStaydownMatchingEnabled()).toBe(false)

      const staydownCase = await createRestrictedStaydownCase({ targetCount: 2 })

      expect(staydownCase.restrictions).toHaveLength(2)
      expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toEqual([])
      expect(enqueueHash).not.toHaveBeenCalled()
    })
  })

  describe('copyright staydown registration with the switch on', () => {
    useStaydownMatching()

    it('registers the exact digest of each moderator-confirmed image and queues its perceptual hash', async () => {
      const staydownCase = await createRestrictedStaydownCase({ targetCount: 2 })

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
      expect(enqueueHash.mock.calls.map(call => call[0]).toSorted()).toEqual(
        staydownCase.imageIds.toSorted(),
      )
      expect(enqueueHash.mock.calls.every(call => call[1] === 'registration')).toBe(true)
    })

    it('does not register an automated restriction no moderator has reviewed', async () => {
      const staydownCase = await createRestrictedStaydownCase({ imposedBy: 'automation' })

      expect(staydownCase.restrictions[0]?.human_review_action).toBeNull()
      expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toEqual([])
      expect(enqueueHash).not.toHaveBeenCalled()
    })

    it.each([
      { action: 'confirm' as const, registers: true },
      { action: 'reverse' as const, registers: false },
    ])(
      'registers an automated restriction after mandatory review only when the moderator chose $action: $registers',
      async ({ action, registers }) => {
        const staydownCase = await createRestrictedStaydownCase({ imposedBy: 'automation' })

        await completeCopyrightMandatoryHumanReview({
          currentUser: staydownCase.moderator,
          noticeId: staydownCase.noticeId,
          restrictionId: staydownCase.restrictions[0]!.id,
          action,
          rationale: 'Reviewed the image against the claimed work.',
          reviewedAt: new Date('2026-07-01T13:00:00.000Z'),
        })

        const entries = await readCopyrightStaydownEntries(staydownCase.noticeId)
        expect(entries.map(entry => entry.image_id)).toEqual(registers ? staydownCase.imageIds : [])
        expect(enqueueHash).toHaveBeenCalledTimes(registers ? 1 : 0)
      },
    )
  })
})
