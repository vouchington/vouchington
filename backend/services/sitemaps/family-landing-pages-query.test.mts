import {
  createTestLandingPage,
  createTestLandingPageGroupedReviewItem,
  createTestLandingPageReviewItem,
  createTestPost,
  createTestTopic,
  createTestUser,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { iterateSitemapFamilyEntries } from './family-queries.mts'

async function hasLandingPage(path: string): Promise<boolean> {
  for await (const entry of iterateSitemapFamilyEntries('landing-pages')) {
    if (entry.path === path) return true
  }
  return false
}

describe('landing-pages sitemap review eligibility', () => {
  it.each(['single', 'grouped'] as const)(
    '%s review controls the landing page in both visibility directions',
    async kind => {
      const user = await createTestUser()
      const review = await createTestPost({ user, post_type: 'review' })
      const page = await createTestLandingPage(user.id, `${kind} review page`)
      if (kind === 'single') {
        await createTestLandingPageReviewItem(page.landingPageId, review.id)
      } else {
        const topic = await createTestTopic({ user })
        await createTestLandingPageGroupedReviewItem(page.landingPageId, topic.id, review.id)
      }
      const path = `/@${user.username}/${page.slug}`

      expect(await hasLandingPage(path)).toBe(true)
      await setTestPostClearanceStatus(review.id, 'pending', user.id)
      expect(await hasLandingPage(path)).toBe(false)
      await setTestPostClearanceStatus(review.id, 'approved', user.id)
      expect(await hasLandingPage(path)).toBe(true)
    },
  )
})
