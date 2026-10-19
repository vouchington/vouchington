import undici, { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  urlExistsForTest,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { createOwnedWebRiskFixture } from '@voucha/test-helpers/web-risk-state'
import { webRiskConfig } from '@services/web-risk/config'
import { createUrlUpsert } from './upsert.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames'

// URL persistence owns this real checker integration; importing URLs from Web Risk would cycle.
describe('addUrl integrates with Google Web Risk blocking', () => {
  it('rechecks mutable hostname policy after an earlier successful validation', async () => {
    const fixture = createOwnedWebRiskFixture()
    const domain = `changed-policy-${crypto.randomUUID()}.example.com`
    const url = `https://${domain}/new-profile-url`
    const hostnames = await upsertUrlHostnames(null, [domain])
    const { addUrl } = createUrlUpsert(async urls => {
      await Promise.all(urls.map(url => fixture.check(url)))
    })
    try {
      await fixture.check(url)
      await updateUrlHostnameBlocked(hostnames.get(domain)!, true)
      await expect(fixture.own(addUrl(null, url))).rejects.toMatchObject({ status: 400 })
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
      const { addUrl } = createUrlUpsert(async urls => {
        await Promise.all(urls.map(url => ownedFixture.check(url)))
      })
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
