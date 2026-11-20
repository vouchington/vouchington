import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect, createTestLandingPage } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { flush } from '@data-stores/analytics/backend-local'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { v7 } from 'uuid'
import { getLandingPageAnalyticsByPageId } from './get-analytics.mts'
import { recordLandingPageVisit } from './record-visit.mts'
import { landingPageAnalyticsWorkConfig } from './work-limits.mts'

describe('landing page UTM sources limit', () => {
  let landingPageId: string

  beforeAll(async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-lpa-cap-'))
    process.env.ANALYTICS_BACKEND = 'local'
    process.env.ANALYTICS_LOCAL_DIR = tmpDir
    const user = await createTestUserDirect()
    const page = await createTestLandingPage(user!.id, 'UTM cap test')
    landingPageId = page.landingPageId
    for (const utmSource of ['alpha', 'alpha', 'alpha', 'beta', 'beta', 'gamma'])
      await recordLandingPageVisit({ landingPageId, sessionId: v7(), utmSource })
    await flush()

    return async () => {
      await fs.promises.rm(tmpDir, { recursive: true, force: true })
      delete process.env.ANALYTICS_BACKEND
      delete process.env.ANALYTICS_LOCAL_DIR
    }
  })

  it('lists only the configured number of top sources', async () => {
    const restore = overrideDynamicConfigFieldsForTest(landingPageAnalyticsWorkConfig, {
      utm_sources_listed: 2,
    })
    try {
      const limited = await getLandingPageAnalyticsByPageId(landingPageId)
      expect(limited.utm_sources.map(source => source.utm_source)).toEqual(['alpha', 'beta'])
      overrideDynamicConfigFieldsForTest(landingPageAnalyticsWorkConfig, { utm_sources_listed: 3 })
      const widened = await getLandingPageAnalyticsByPageId(landingPageId)
      expect(widened.utm_sources.map(source => source.utm_source)).toEqual([
        'alpha',
        'beta',
        'gamma',
      ])
    } finally {
      restore()
    }
  })
})
