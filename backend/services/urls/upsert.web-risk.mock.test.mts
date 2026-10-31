import undici, { Response as UndiciResponse } from 'undici'
import { beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  urlExistsForTest,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { createOwnedWebRiskFixture } from '@voucha/test-helpers/web-risk-state'
import { webRiskConfig } from '@services/web-risk/config'
import { upsertUrlHostnames } from '@services/urls-hostnames'

const ownedWebRisk = vi.hoisted(() => ({
  check: null as ((url: string) => Promise<void>) | null,
}))

// Worker setup evaluates URL upsert before this file is loaded, so the mock has to
// rebind a fresh upsert. The real checker stays parameter-free and uses the owned namespace.
// eslint-disable-next-line no-mistakes/module-mock-boundary -- owned namespace only
vi.mock<typeof import('@services/web-risk/check')>(
  import('@services/web-risk/check'),
  async importOriginal => {
    const actual = await importOriginal()
    return {
      ...actual,
      assertUrlsAllowedByWebRisk: async urls => {
        const check = ownedWebRisk.check
        if (check === null) throw new Error('Owned Web Risk fixture is not bound')
        await Promise.all(urls.map(url => check(url)))
      },
    }
  },
)

type UrlUpsert = Pick<typeof import('./upsert.mts'), 'addUrl' | 'assessUrls'>

let addUrl: UrlUpsert['addUrl']
let assessUrls: UrlUpsert['assessUrls']

describe('addUrl integrates with Google Web Risk blocking', () => {
  beforeAll(async () => {
    vi.resetModules()
    const upsert = await import('./upsert.mts')
    addUrl = upsert.addUrl
    assessUrls = upsert.assessUrls
  })

  it('rechecks mutable hostname policy after an earlier successful validation', async () => {
    const fixture = createOwnedWebRiskFixture()
    ownedWebRisk.check = fixture.check
    const domain = `changed-policy-${crypto.randomUUID()}.example.com`
    const url = `https://${domain}/new-profile-url`
    const hostnames = await upsertUrlHostnames(null, [domain])
    try {
      await assessUrls([url])
      await updateUrlHostnameBlocked(hostnames.get(domain)!, true)
      await expect(addUrl(null, url)).rejects.toMatchObject({ status: 400 })
      expect(await urlExistsForTest(url)).toBe(false)
    } finally {
      ownedWebRisk.check = null
      await fixture.cleanup()
    }
  })

  it('rejects risky URLs before writing URL rows', async () => {
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    let restoreConfig: (() => void) | undefined
    let fetchSpy: MockInstance<typeof undici.fetch> | undefined
    let fixture: ReturnType<typeof createOwnedWebRiskFixture> | undefined
    try {
      await webRiskConfig.waitForInitialization()
      restoreConfig = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
      fixture = createOwnedWebRiskFixture()
      ownedWebRisk.check = fixture.check
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
      ownedWebRisk.check = null
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
