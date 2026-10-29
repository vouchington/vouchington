import { describe, expect, it } from 'vitest'
import { withCopyrightRationaleRetentionScene } from '@voucha/test-helpers/copyright-rationale-retention-scene'

describe('copyright attempted rationale retention', () => {
  it.each(['eu_dsa', 'uk'] as const)(
    'expires an old %s attempt without changing the current case decision',
    async jurisdiction => {
      await withCopyrightRationaleRetentionScene(async scene => {
        const { noticeId, claimantId, rationaleId } = await scene.createCase(jurisdiction)
        const current = await scene.caseResult(noticeId)
        expect(current).toEqual({ outcome: 'no_action', rationale: 'final reason' })
        expect(await scene.eligible(rationaleId)).toBe(true)

        const holdId = await scene.hold(claimantId)
        expect(await scene.eligible(rationaleId)).toBe(false)
        expect(await scene.deleteEligible(rationaleId)).toBe(0)
        await scene.release(holdId)

        expect(await scene.eligible(rationaleId)).toBe(true)
        expect(await scene.deleteEligible(rationaleId)).toBe(1)
        expect(await scene.caseResult(noticeId)).toEqual(current)
      })
    },
  )

  it('uses the stable review identity when the completed history event has another ID', async () => {
    await withCopyrightRationaleRetentionScene(async scene => {
      const { rationaleId, reviewIdentityId, reviewEventId } = await scene.createReview()
      expect(reviewEventId).not.toBe(reviewIdentityId)
      expect(await scene.eligible(rationaleId)).toBe(true)
      expect(await scene.deleteEligible(rationaleId)).toBe(1)
    })
  })

  it('retires an old account attempt while the effective termination explanation remains', async () => {
    await withCopyrightRationaleRetentionScene(async scene => {
      const { accountId, rationaleId } = await scene.createAccountTermination()
      const current = await scene.accountResult(accountId)
      expect(current).toEqual({
        outcome: 'terminate',
        currentRationale: 'current termination explanation',
        effectiveRationale: 'effective termination explanation',
      })
      expect(await scene.eligible(rationaleId)).toBe(true)
      expect(await scene.deleteEligible(rationaleId)).toBe(1)
      expect(await scene.accountResult(accountId)).toEqual(current)
    })
  })
})
