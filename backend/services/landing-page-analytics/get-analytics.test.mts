import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestLandingPage,
  createTestLandingPageProfileLinkItem,
} from '@voucha/test-helpers'
import { getLandingPageAnalytics } from './get-analytics.mts'
import { recordLandingPageVisit } from './record-visit.mts'
import { recordLandingPageItemClick } from './record-click.mts'
import { flush } from '@data-stores/analytics/backend-local'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { v7 } from 'uuid'

describe('get-analytics', () => {
  let userId: string
  let landingPageId: string
  let landingPageItemId: string
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-lpa-'))
    process.env.ANALYTICS_BACKEND = 'local'
    process.env.ANALYTICS_LOCAL_DIR = tmpDir

    const user = await createTestUserDirect()
    userId = user!.id

    const { landingPageId: pageId } = await createTestLandingPage(userId, 'Get Analytics Test')
    landingPageId = pageId
    const { landingPageItemId: itemId } = await createTestLandingPageProfileLinkItem(
      userId,
      landingPageId,
    )
    landingPageItemId = itemId

    // Record some visits and clicks
    await recordLandingPageVisit({ landingPageId, sessionId: v7() })
    await recordLandingPageVisit({ landingPageId, sessionId: v7() })
    await recordLandingPageItemClick({ landingPageId, landingPageItemId, sessionId: v7() })
    await flush()

    return async () => {
      await fs.promises.rm(tmpDir, { recursive: true, force: true })
      delete process.env.ANALYTICS_BACKEND
      delete process.env.ANALYTICS_LOCAL_DIR
    }
  })

  describe('getLandingPageAnalytics', () => {
    it('returns aggregated analytics', async () => {
      const analytics = await getLandingPageAnalytics(userId, landingPageId)
      expect(analytics.total_visits).toBeGreaterThanOrEqual(2)
      expect(analytics.total_clicks).toBeGreaterThanOrEqual(1)
      expect(analytics.ctr).toBeGreaterThan(0)
      expect(analytics.unique_visitors).toBeGreaterThanOrEqual(2)
      expect(analytics.item_clicks).toHaveLength(1)
      expect(analytics.item_clicks[0]!.item_id).toBe(landingPageItemId)
      expect(analytics.item_clicks[0]!.click_count).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(analytics.utm_sources)).toBe(true)
    })

    it('throws 404 for wrong user', async () => {
      const otherUser = await createTestUserDirect()
      await expect(getLandingPageAnalytics(otherUser!.id, landingPageId)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('counts unique visitors by distinct session IDs', async () => {
      const analyticsBefore = await getLandingPageAnalytics(userId, landingPageId)

      const sharedSession = v7()
      await recordLandingPageVisit({ landingPageId, sessionId: sharedSession })
      await recordLandingPageVisit({ landingPageId, sessionId: sharedSession })
      await recordLandingPageVisit({ landingPageId, sessionId: v7() })
      await flush()

      const analyticsAfter = await getLandingPageAnalytics(userId, landingPageId)

      const addedTotalVisits = analyticsAfter.total_visits - analyticsBefore.total_visits
      const addedUniqueVisitors = analyticsAfter.unique_visitors - analyticsBefore.unique_visitors

      expect(addedTotalVisits).toBe(3)
      expect(addedUniqueVisitors).toBe(2)
      expect(analyticsAfter.unique_visitors).toBeLessThanOrEqual(analyticsAfter.total_visits)
    })

    it('returns UTM source breakdown', async () => {
      await recordLandingPageVisit({ landingPageId, sessionId: v7(), utmSource: 'twitter' })
      await recordLandingPageVisit({ landingPageId, sessionId: v7(), utmSource: 'linkedin' })
      await recordLandingPageVisit({ landingPageId, sessionId: v7() })
      await flush()

      const analytics = await getLandingPageAnalytics(userId, landingPageId)
      expect(analytics.utm_sources).toBeDefined()
      expect(Array.isArray(analytics.utm_sources)).toBe(true)
      expect(analytics.utm_sources.length).toBeGreaterThanOrEqual(1)
      for (const source of analytics.utm_sources) {
        expect(typeof source.utm_source).toBe('string')
        expect(typeof source.visits).toBe('number')
        expect(source.visits).toBeGreaterThan(0)
      }
    })

    it('includes unique_visitors in daily_stats', async () => {
      const analytics = await getLandingPageAnalytics(userId, landingPageId)
      for (const day of analytics.daily_stats) {
        expect(typeof day.unique_visitors).toBe('number')
        expect(day.unique_visitors).toBeLessThanOrEqual(day.visits)
      }
    })
  })
})
