import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, setTestPostClearanceStatus } from '@voucha/test-helpers'
import { getMyLandingPageCandidates } from './candidates.mts'

describe('landing page candidates past ineligible reviews', () => {
  it('keeps the next review when an ineligible review sits between eligible ones', async () => {
    const user = await createTestUser()
    const reviews = []
    for (const title of ['older', 'hidden', 'newer']) {
      reviews.push(await createTestPost({ user, post_type: 'review', title }))
    }
    await setTestPostClearanceStatus(reviews[1]!.id, 'pending', user.id)

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await getMyLandingPageCandidates(user.id, { limit: 1, after })
      seen.push(...page.candidates.reviews.map(review => review.id))
      if (page.candidates.reviews.length === 0 && page.page_info.has_next_page)
        emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([reviews[2]!.id, reviews[0]!.id])
    expect(emptyContinuation).toBe(true)
  })
})
