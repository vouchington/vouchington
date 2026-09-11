import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { recordLandingPageVisit } from './record-visit.mts'
import { createTestUserDirect, createTestLandingPage } from '@voucha/test-helpers'

describe('record-visit', () => {
  let testDir: string
  let landingPageId: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-lp-visit-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'

    const user = await createTestUserDirect()
    const { landingPageId: pageId } = await createTestLandingPage(user!.id, 'Record Visit Test')
    landingPageId = pageId
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('recordLandingPageVisit', () => {
    it('emits a landing_page web_page_view event', async () => {
      const sessionId = crypto.randomUUID()
      await recordLandingPageVisit({ landingPageId, sessionId })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM web_page_view WHERE page_kind = 'landing_page' AND page_id = '${landingPageId}' AND session_id = '${sessionId}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.page_kind).toBe('landing_page')
      expect(rows[0]!.page_id).toBe(landingPageId)
    })

    it('emits utm params', async () => {
      const sessionId = crypto.randomUUID()
      await recordLandingPageVisit({
        landingPageId,
        sessionId,
        referrer: 'https://instagram.com',
        utmSource: 'instagram',
        utmMedium: 'bio',
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM web_page_view WHERE page_kind = 'landing_page' AND page_id = '${landingPageId}' AND session_id = '${sessionId}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.referrer).toBe('https://instagram.com')
      expect(rows[0]!.utm_source).toBe('instagram')
      expect(rows[0]!.utm_medium).toBe('bio')
    })

    it('does not emit for a non-existent landing page', async () => {
      const fakeLandingPageId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      await recordLandingPageVisit({ landingPageId: fakeLandingPageId, sessionId })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM web_page_view WHERE page_kind = 'landing_page' AND page_id = '${fakeLandingPageId}'`,
      )
      expect(rows).toHaveLength(0)
    })
  })
})
