import undici, { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import { overrideDynamicConfigFieldsForTest, urlExistsForTest } from '@voucha/test-helpers'
import { createOwnedWebRiskFixture } from '@voucha/test-helpers/web-risk-state'
import { webRiskConfig } from '@services/web-risk/config'
import { createUrlUpsert } from './upsert.mts'

// URL persistence owns this real checker integration; importing URLs from Web Risk would cycle.
describe('addUrl integrates with Google Web Risk blocking', () => {
  it('retains blocking when a caller passes its already loaded hostname policies', async () => {
    const fixture = createOwnedWebRiskFixture()
    const domain = `precomputed-risk-${crypto.randomUUID()}.example.com`
    const url = `https://${domain}/blocked`
    const { addUrl } = createUrlUpsert(fixture.check)
    try {
      await expect(
        fixture.own(
          addUrl(null, url, {
            webRiskOptions: {
              policies: new Map([[domain, { is_blocked: true, should_skip_web_risk: false }]]),
            },
          }),
        ),
      ).rejects.toMatchObject({ status: 400 })
      expect(await urlExistsForTest(url)).toBe(false)
    } finally {
      await fixture.cleanup()
    }
  })

  it('rejects risky URLs before writing URL rows', async () => {
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    let restoreConfig: (() => void) | undefined
    let fixture: ReturnType<typeof createOwnedWebRiskFixture> | undefined
    let fetchSpy: MockInstance<typeof undici.fetch> | undefined
    try {
      await webRiskConfig.waitForInitialization()
      restoreConfig = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
      const ownedFixture = createOwnedWebRiskFixture()
      fixture = ownedFixture
      const currentFetchSpy = vi.spyOn(undici, 'fetch')
      fetchSpy = currentFetchSpy
      if (undici.fetch !== currentFetchSpy) {
        throw new Error('The preloaded checker uses a different Undici fetch object')
      }
      currentFetchSpy.mockRejectedValue(new Error('Unexpected Web Risk provider request'))
      const { addUrl } = createUrlUpsert(ownedFixture.check)
      const domain = `prewrite-risk-${crypto.randomUUID()}.test`
      const url = `https://${domain}/bad`
      currentFetchSpy.mockResolvedValueOnce(
        UndiciResponse.json({
          threat: { threatTypes: ['MALWARE'] },
        }),
      )

      await expect(ownedFixture.own(addUrl(null, url))).rejects.toMatchObject({ status: 400 })

      expect(await urlExistsForTest(url)).toBe(false)
      expect(currentFetchSpy).toHaveBeenCalledTimes(1)
      await expect(ownedFixture.countWindow(ownedFixture.windowKeys()[1])).resolves.toBe(1)
    } finally {
      try {
        await fixture?.cleanup()
      } finally {
        fetchSpy?.mockRestore()
        restoreConfig?.()
        vi.unstubAllEnvs()
      }
    }
  })
})
