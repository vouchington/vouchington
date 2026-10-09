import { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import * as domains from '@services/urls-domains-blacklist/domains'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { updateUrlHostnameBlocked } from '@voucha/test-helpers'
import { withGoogleWebRiskTest } from '@voucha/test-helpers/web-risk-state'
import { assertUrlsAllowedByWebRisk } from './check.mts'

describe('Google Web Risk hostname policy and provider gate', () => {
  it('reads the hostname policy and the provider gate together', () =>
    withGoogleWebRiskTest(async context => {
      const gateSpy = vi.spyOn(context.fixture.state, 'readProviderGate')
      let finishPolicy: () => void = () => {}
      const policySpy = vi.spyOn(domains, 'getHostnamePolicy').mockImplementation(
        () =>
          new Promise(resolve => {
            finishPolicy = () => resolve({ is_blocked: false, should_skip_web_risk: true })
          }),
      )
      try {
        const pending = context.fixture.check(`https://concurrent-${crypto.randomUUID()}.test/page`)

        // The gate pipeline was issued before the unresolved policy read: one round trip of depth.
        expect(policySpy).toHaveBeenCalledTimes(1)
        expect(gateSpy).toHaveBeenCalledTimes(1)
        finishPolicy()
        await pending
        expect(context.fetchSpy).not.toHaveBeenCalled()
      } finally {
        policySpy.mockRestore()
        gateSpy.mockRestore()
      }
    }))

  it('reports a blocked hostname even when the provider gate read fails', () =>
    withGoogleWebRiskTest(async context => {
      const domain = `blocked-gate-${crypto.randomUUID()}.test`
      const hostnameMap = await upsertUrlHostnames(null, [domain])
      await updateUrlHostnameBlocked(hostnameMap.get(domain)!, true)
      const gateSpy = vi
        .spyOn(context.fixture.state, 'readProviderGate')
        .mockRejectedValue(new Error('valkey unavailable'))
      try {
        await expect(context.fixture.check(`https://${domain}/page`)).rejects.toMatchObject({
          status: 400,
          message: `Domain is blocked: ${domain}`,
        })
      } finally {
        gateSpy.mockRestore()
      }
    }))

  it('skips a should_skip_web_risk hostname without charging the limiter or surfacing a gate failure', () =>
    withGoogleWebRiskTest(async context => {
      const domain = `skip-gate-${crypto.randomUUID()}.test`
      const hostnameMap = await upsertUrlHostnames(null, [domain])
      await updateUrlHostname(hostnameMap.get(domain)!, { should_skip_web_risk: true })
      const gateSpy = vi
        .spyOn(context.fixture.state, 'readProviderGate')
        .mockRejectedValue(new Error('valkey unavailable'))
      try {
        await expect(context.fixture.check(`https://${domain}/page`)).resolves.toBeUndefined()
      } finally {
        gateSpy.mockRestore()
      }

      expect(context.fetchSpy).not.toHaveBeenCalled()
      await expect(context.fixture.countWindow(context.fixture.windowKeys()[1])).resolves.toBe(0)
    }))

  it('charges the limiter once for an uncached URL and not again after the clean verdict is cached', () =>
    withGoogleWebRiskTest(async context => {
      const url = `https://charge-once-${crypto.randomUUID()}.test/page`
      context.fetchSpy.mockResolvedValueOnce(UndiciResponse.json({}))

      await context.fixture.check(url)
      await context.fixture.check(url)

      await expect(context.fixture.countWindow(context.fixture.windowKeys()[1])).resolves.toBe(1)
    }))

  it('uses precomputed policies instead of reading the hostname policy again', () =>
    withGoogleWebRiskTest(async context => {
      const skipHost = `precomputed-skip-${crypto.randomUUID()}.test`
      const blockedHost = `precomputed-block-${crypto.randomUUID()}.test`
      const policies = new Map([
        [skipHost, { is_blocked: false, should_skip_web_risk: true }],
        [blockedHost, { is_blocked: true, should_skip_web_risk: false }],
      ])
      const policySpy = vi.spyOn(domains, 'getHostnamePolicy')
      const gateSpy = vi.spyOn(context.fixture.state, 'readProviderGate')
      try {
        await context.fixture.check(`https://${skipHost}/page`, { policies })
        await expect(
          context.fixture.check(`https://${blockedHost}/page`, { policies }),
        ).rejects.toMatchObject({ status: 400, message: `Domain is blocked: ${blockedHost}` })

        expect(policySpy).not.toHaveBeenCalled()
        expect(gateSpy).not.toHaveBeenCalled()
        expect(context.fetchSpy).not.toHaveBeenCalled()
      } finally {
        policySpy.mockRestore()
        gateSpy.mockRestore()
      }
    }))

  it('reads one batched policy for many URLs and rejects a blocked hostname', () =>
    withGoogleWebRiskTest(async context => {
      context.setEnabled(false)
      const blockedDomain = `batch-blocked-${crypto.randomUUID()}.test`
      const hostnameMap = await upsertUrlHostnames(null, [blockedDomain])
      await updateUrlHostnameBlocked(hostnameMap.get(blockedDomain)!, true)
      const cleanUrl = `https://batch-clean-${crypto.randomUUID()}.test/page`
      const policiesSpy = vi.spyOn(domains, 'getHostnamePolicies')
      const policySpy = vi.spyOn(domains, 'getHostnamePolicy')
      try {
        await expect(assertUrlsAllowedByWebRisk([cleanUrl, cleanUrl])).resolves.toBeUndefined()
        await expect(
          assertUrlsAllowedByWebRisk([cleanUrl, `https://www.${blockedDomain}/x`, 'not a url']),
        ).rejects.toMatchObject({ status: 400 })

        expect(policiesSpy).toHaveBeenCalledTimes(2)
        expect(policySpy).not.toHaveBeenCalled()
      } finally {
        policiesSpy.mockRestore()
        policySpy.mockRestore()
      }
    }))
})
