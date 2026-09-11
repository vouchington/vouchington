import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import {
  createTestUserDirect,
  createTestLandingPage,
  createTestLandingPageProfileLinkItem,
} from '@voucha/test-helpers'
import { recordLandingPageItemClick } from './record-click.mts'

describe('record-click', () => {
  let testDir: string
  let landingPageId: string
  let landingPageItemId: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-lp-click-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'

    const user = await createTestUserDirect()
    const { landingPageId: pageId } = await createTestLandingPage(user!.id, 'Click Test LP')
    landingPageId = pageId
    const { landingPageItemId: itemId } = await createTestLandingPageProfileLinkItem(
      user!.id,
      landingPageId,
    )
    landingPageItemId = itemId
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
    delete process.env.ANALYTICS_BACKEND
    delete process.env.ANALYTICS_LOCAL_DIR
  })

  describe('recordLandingPageItemClick', () => {
    it('emits a web_click event when item belongs to landing page', async () => {
      const sessionId = crypto.randomUUID()
      await recordLandingPageItemClick({ landingPageId, landingPageItemId, sessionId })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM web_click WHERE page_kind = 'landing_page' AND target_id = '${landingPageItemId}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.target_kind).toBe('item')
      expect(rows[0]!.page_id).toBe(landingPageId)
    })

    it('does not emit when item does not belong to the landing page', async () => {
      const unrelatedItemId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      await recordLandingPageItemClick({
        landingPageId,
        landingPageItemId: unrelatedItemId,
        sessionId,
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM web_click WHERE page_kind = 'landing_page' AND target_id = '${unrelatedItemId}'`,
      )
      expect(rows.length).toBe(0)
    })
  })
})
