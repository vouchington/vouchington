import undici, { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  urlExistsForTest,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { webRiskConfig } from '@services/web-risk/config'
import { addUrl, assessUrls } from './upsert.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames'

// URL persistence owns this real checker integration; importing URLs from Web Risk would cycle.
describe('addUrl integrates with Google Web Risk blocking', () => {
  it('rechecks mutable hostname policy after an earlier successful validation', async () => {
    const domain = `changed-policy-${crypto.randomUUID()}.example.com`
    const url = `https://${domain}/new-profile-url`
    const hostnames = await upsertUrlHostnames(null, [domain])
    await assessUrls([url])
    await updateUrlHostnameBlocked(hostnames.get(domain)!, true)
    await expect(addUrl(null, url)).rejects.toMatchObject({ status: 400 })
    expect(await urlExistsForTest(url)).toBe(false)
  })

  it('rejects risky URLs before writing URL rows', async () => {
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    let restoreConfig: (() => void) | undefined
    let fetchSpy: MockInstance<typeof undici.fetch> | undefined
    try {
      await webRiskConfig.waitForInitialization()
      restoreConfig = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
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
    } finally {
      fetchSpy?.mockRestore()
      restoreConfig?.()
      vi.unstubAllEnvs()
    }
  })
})
