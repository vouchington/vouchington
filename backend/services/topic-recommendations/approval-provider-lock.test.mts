import undici, { Response as UndiciResponse } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { webRiskConfig } from '@services/web-risk/config'
import { createTopicRecommendation, approveTopicRecommendation } from './index.mts'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { getTopicByAny } from '@services/topics/get'

describe('approval provider assessment precedes ownership locks', () => {
  it('commits a provider block of the registrable ancestor and rolls back approval', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const ancestor = `provider-${suffix}.test`
    const hostname = `blog.${ancestor}`
    const slug = `provider-claim-${suffix}`
    const recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'Provider-flagged ancestor',
      topic_title: `Provider ${suffix}`,
      topic_slug: slug,
      topic_hostnames: [hostname],
    })
    await webRiskConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    const fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValue(UndiciResponse.json({ threat: { threatTypes: ['MALWARE'] } }))
    try {
      await expect(
        approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation),
      ).rejects.toMatchObject({ status: 400 })
      expect((await getUrlHostnameByAny(ancestor))?.is_blocked).toBe(true)
      expect(await getTopicByAny(slug)).toBeNull()
    } finally {
      fetch.mockRestore()
      restore()
      vi.unstubAllEnvs()
    }
  })
})
