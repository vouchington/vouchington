import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { queryTestAnalyticsWebClicks } from '@voucha/test-helpers/data-stores/analytics/queries'
import { recordLandingPageItemClick } from './web-click.mts'

describe('web-click', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-web-click-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('recordLandingPageItemClick', () => {
    it('records a landing page item click', async () => {
      const pageId = crypto.randomUUID()
      const targetId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      recordLandingPageItemClick({
        pageKind: 'landing_page',
        pageId,
        targetKind: 'item',
        targetId,
        sessionId,
      })
      await flush()

      const rows = await queryTestAnalyticsWebClicks('landing_page', targetId)
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.target_kind).toBe('item')
    })
  })
})
