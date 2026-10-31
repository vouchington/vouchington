import undici, { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  urlExistsForTest,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { createOwnedWebRiskFixture } from '@voucha/test-helpers/web-risk-state'
import * as webRiskCheck from '@services/web-risk/check'
import { webRiskConfig } from '@services/web-risk/config'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { addUrl, assessUrls } from './upsert.mts'

function spyOnOwnedWebRiskCheck(
  fixture: ReturnType<typeof createOwnedWebRiskFixture>,
): MockInstance<typeof webRiskCheck.assertUrlsAllowedByWebRisk> {
  return vi.spyOn(webRiskCheck, 'assertUrlsAllowedByWebRisk').mockImplementation(async urls => {
    await Promise.all(urls.map(url => fixture.check(url)))
  })
}

describe('addUrl integrates with Google Web Risk blocking', () => {
  it('rechecks mutable hostname policy after an earlier successful validation', async () => {
    const fixture = createOwnedWebRiskFixture()
    const checkSpy = spyOnOwnedWebRiskCheck(fixture)
    const domain = `changed-policy-${crypto.randomUUID()}.example.com`
    const url = `https://${domain}/new-profile-url`
    const hostnames = await upsertUrlHostnames(null, [domain])
    try {
      await assessUrls([url])
      await updateUrlHostnameBlocked(hostnames.get(domain)!, true)
      await expect(addUrl(null, url)).rejects.toMatchObject({ status: 400 })
      expect(await urlExistsForTest(url)).toBe(false)
    } finally {
      checkSpy.mockRestore()
      await fixture.cleanup()
    }
  })

  it('rejects risky URLs before writing URL rows', async () => {
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    let restoreConfig: (() => void) | undefined
    let fetchSpy: MockInstance<typeof undici.fetch> | undefined
    let checkSpy: MockInstance<typeof webRiskCheck.assertUrlsAllowedByWebRisk> | undefined
    let fixture: ReturnType<typeof createOwnedWebRiskFixture> | undefined
    try {
      await webRiskConfig.waitForInitialization()
      restoreConfig = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
      fixture = createOwnedWebRiskFixture()
      checkSpy = spyOnOwnedWebRiskCheck(fixture)
      const currentFetchSpy = vi.spyOn(undici, 'fetch')
      fetchSpy = currentFetchSpy
      if (undici.fetch !== currentFetchSpy) {
        throw new Error('The preloaded checker uses a different Undici fetch object')
      }
      currentFetchSpy.mockRejectedValue(new Error('Unexpected Web Risk provider request'))
      const domain = `prewrite-risk-${crypto.randomUUID()}.test`
      const url = `https://${domain}/bad`
      currentFetchSpy.mockResolvedValueOnce(
        UndiciResponse.json({
          threat: { threatTypes: ['MALWARE'] },
        }),
      )

      await expect(addUrl(null, url)).rejects.toMatchObject({ status: 400 })

      expect(await urlExistsForTest(url)).toBe(false)
      expect(currentFetchSpy).toHaveBeenCalledTimes(1)
      await expect(fixture.countWindow(fixture.windowKeys()[1])).resolves.toBe(1)
    } finally {
      checkSpy?.mockRestore()
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
