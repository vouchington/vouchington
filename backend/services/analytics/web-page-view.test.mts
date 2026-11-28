import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { queryTestAnalyticsWebPageViewsByKindAndPage } from '@voucha/test-helpers/data-stores/analytics/queries'
import {
  recordLandingPageVisit,
  recordRecentlyViewedRssFeed,
  recordRecentlyViewedTopic,
  recordRecentlyViewedPost,
} from './web-page-view.mts'

describe('web-page-view', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-web-page-view-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('recordLandingPageVisit', () => {
    it('records a landing page visit', async () => {
      const pageId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      recordLandingPageVisit({ pageId, sessionId })
      await flush()

      const rows = await queryTestAnalyticsWebPageViewsByKindAndPage('landing_page', pageId)
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.page_kind).toBe('landing_page')
    })
  })

  describe('recordRecentlyViewedTopic', () => {
    it('records a topic page view', async () => {
      const pageId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      recordRecentlyViewedTopic({ pageId, sessionId })
      await flush()

      const rows = await queryTestAnalyticsWebPageViewsByKindAndPage('topic', pageId)
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.page_kind).toBe('topic')
    })
  })

  describe('recordRecentlyViewedPost', () => {
    it('records a post page view', async () => {
      const pageId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      recordRecentlyViewedPost({ pageId, sessionId })
      await flush()

      const rows = await queryTestAnalyticsWebPageViewsByKindAndPage('post', pageId)
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.page_kind).toBe('post')
    })
  })

  describe('recordRecentlyViewedRssFeed', () => {
    it('records an rss feed page view', async () => {
      const pageId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      recordRecentlyViewedRssFeed({ pageId, sessionId })
      await flush()

      const rows = await queryTestAnalyticsWebPageViewsByKindAndPage('rss_feed', pageId)
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.page_kind).toBe('rss_feed')
    })
  })
})
