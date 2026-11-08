import { Response as UndiciResponse } from 'undici'
import { describe, expect, it } from 'vitest'
import { withGoogleWebRiskTest } from '@voucha/test-helpers/web-risk-state'
import { blockedUrlsFromWebRiskScreenWithState } from './check-batch.mts'

describe('Web Risk batch provider cooldown', () => {
  it('admits the failed URL and does not call the provider again in the same batch', () =>
    withGoogleWebRiskTest(async context => {
      const firstUrl = `https://batch-rate-${crypto.randomUUID()}.test/one`
      const secondUrl = `https://batch-rate-${crypto.randomUUID()}.test/two`
      context.fetchSpy.mockResolvedValueOnce(new UndiciResponse(null, { status: 429 }))

      await expect(
        blockedUrlsFromWebRiskScreenWithState(context.fixture.state, [firstUrl, secondUrl]),
      ).resolves.toEqual(new Set())
      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
    }))

  it('treats a provider error as a cooldown for the remaining URLs in the batch', () =>
    withGoogleWebRiskTest(async context => {
      const firstUrl = `https://batch-error-${crypto.randomUUID()}.test/one`
      const secondUrl = `https://batch-error-${crypto.randomUUID()}.test/two`
      context.fetchSpy.mockRejectedValueOnce(new Error('network unavailable'))

      await expect(
        blockedUrlsFromWebRiskScreenWithState(context.fixture.state, [firstUrl, secondUrl]),
      ).resolves.toEqual(new Set())
      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
    }))
})
