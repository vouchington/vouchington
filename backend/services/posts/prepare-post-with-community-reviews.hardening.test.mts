import undici, { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  overrideDynamicConfigFieldsForTest,
  waitForTestPostgresLockWaiter,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { expireWebRiskCleanVerdictForTest } from '@voucha/test-helpers/web-risk-state'
import { getTestPostCreationSourceUrlId } from '@voucha/test-helpers/entities/post-field-queries'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { addUrl } from '@services/urls/upsert'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { webRiskConfig } from '../web-risk/config.mts'
import { blockHostname } from '../hostname-blocking/block-hostname.mts'
import { createPost } from './create.mts'

describe('post URL policy across ownership and publication locks', () => {
  it('persists an assessed source relation without another provider request under locks', async () => {
    const admin = await createTestUser({ administrator: true })
    const href = `https://post-policy-${crypto.randomUUID()}.test/source`
    const url = await addUrl(admin.id, href)
    expect(url).not.toBeNull()
    await webRiskConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    const fetch = vi.spyOn(undici, 'fetch').mockImplementation(async () => UndiciResponse.json({}))
    await using holder = await beginTransaction()
    await lockAuthorPublicationLifecycle(holder, admin.id)
    const pid = await getTestPostgresBackendProcessId(holder)
    const creating = createPost(admin, WEB_PROVENANCE, { post_type: 'link', url: href }).then(
      value => ({ value }),
      (err: unknown) => ({ err }),
    )
    try {
      try {
        await waitForTestPostgresLockWaiter(pid, 'lockPostPublicationScope')
        await expireWebRiskCleanVerdictForTest(href)
      } finally {
        await holder.commit()
      }
      const result = await creating
      expect(result).toHaveProperty('value')
      if (!('value' in result)) throw new Error('Post creation failed')
      expect(await getTestPostCreationSourceUrlId(result.value.id)).toBe(url!.id)
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      fetch.mockRestore()
      restore()
      vi.unstubAllEnvs()
    }
  })

  it('rejects a local block committed while the unlocked provider assessment is in flight', async () => {
    const admin = await createTestUser({ administrator: true })
    const hostname = `post-block-${crypto.randomUUID()}.test`
    const href = `https://${hostname}/source`
    await addUrl(admin.id, href)
    const hostnameId = (await getUrlHostnameByAny(hostname))!.id
    await webRiskConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    const requested = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const fetch = vi.spyOn(undici, 'fetch').mockImplementation(async () => {
      requested.resolve()
      await release.promise
      return UndiciResponse.json({})
    })
    const creating = createPost(admin, WEB_PROVENANCE, { post_type: 'link', url: href }).then(
      () => null,
      (err: unknown) => err,
    )
    try {
      await requested.promise
      try {
        await blockHostname(admin.id, hostnameId, { penalizeCreators: false })
      } finally {
        release.resolve()
      }
      expect(await creating).toMatchObject({ status: 422 })
      expect((await getUrlHostnameByAny(hostname))?.is_blocked).toBe(true)
    } finally {
      release.resolve()
      fetch.mockRestore()
      restore()
      vi.unstubAllEnvs()
    }
  })
})
