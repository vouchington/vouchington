import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { withCopyrightHistoryHoldScene } from '../../../test-helpers/copyright-history-hold-scene.mts'

describe('monthly copyright history legal preservation', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('uses case parties and the repeat account, excluding reviewer and unrelated holds', async () => {
    await withCopyrightHistoryHoldScene(async scene => {
      const lifecycle = () => scene.check('copyright_notice_lifecycle_changes')
      const repeat = () => scene.check('copyright_repeat_infringer_reviews')
      const clear = { preview: null, recheck: null }
      const blocked = { preview: 'legal-hold', recheck: 'legal-hold' }

      expect(await lifecycle()).toEqual(clear)
      expect(await repeat()).toEqual(clear)

      for (const party of ['unrelated', 'reviewer'] as const) {
        const hold = await scene.placeHold(party)
        expect(await lifecycle()).toEqual(clear)
        expect(await repeat()).toEqual(clear)
        await scene.releaseHold(hold)
      }

      for (const party of ['claimant', 'submitter', 'incident', 'placement'] as const) {
        const hold = await scene.placeHold(party)
        expect(await lifecycle()).toEqual(blocked)
        expect(await repeat()).toEqual(clear)
        await scene.releaseHold(hold)
        expect(await lifecycle()).toEqual(clear)
      }

      const accountHold = await scene.placeHold('repeat')
      expect(await repeat()).toEqual(blocked)
      expect(await lifecycle()).toEqual(clear)
      await scene.releaseHold(accountHold)
      expect(await repeat()).toEqual(clear)
    })
  })
})
