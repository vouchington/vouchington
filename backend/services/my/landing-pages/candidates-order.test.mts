import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestLandingPageProfileLinkItem } from '@voucha/test-helpers/entities/landing-pages'
import { insertTestReview } from '@voucha/test-helpers/entities/topics'
import { reorderProfileLinks } from '../profile-links-reorder.mts'
import { decodeCursor, encodeCursor } from '@modules/pagination'
import { createMyLandingPage } from './create.mts'
import { getMyLandingPageCandidates } from './candidates.mts'

describe('profile candidate ordering', () => {
  it('pages profile links in their user-chosen order before reviews', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Order', slug: 'order' })
    const links = []
    for (let index = 0; index < 3; index++) {
      links.push(await createTestLandingPageProfileLinkItem(user.id, page.id))
    }
    const order = [links[1]!.profileLinkId, links[0]!.profileLinkId, links[2]!.profileLinkId]
    await reorderProfileLinks(user.id, order)
    const all = await getMyLandingPageCandidates(user.id)
    expect(all.candidates.profile_links.map(link => link.id)).toEqual(order)
    const reviewId = await insertTestReview({ userId: user.id, topicRatings: [] })
    const seen: string[] = []
    let after: string | null = null
    for (let index = 0; index < 4; index++) {
      const result = await getMyLandingPageCandidates(user.id, { limit: 1, after })
      seen.push(...result.candidates.profile_links.map(link => link.id))
      seen.push(...result.candidates.reviews.map(review => review.id))
      expect(result.page_info.has_next_page).toBe(index < 3)
      after = result.page_info.end_cursor
    }
    expect(seen).toEqual([...order, reviewId])
  })
})

describe('profile candidate cursor ties', () => {
  it('uses ascending IDs to continue equal sort orders without a repeat or omission', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Ties', slug: 'ties' })
    const older = await createTestLandingPageProfileLinkItem(user.id, page.id)
    const newer = await createTestLandingPageProfileLinkItem(user.id, page.id)
    const first = await getMyLandingPageCandidates(user.id, { limit: 1 })
    expect(first.candidates.profile_links.map(link => link.id)).toEqual([older.profileLinkId])
    const next = await getMyLandingPageCandidates(user.id, {
      limit: 1,
      after: first.page_info.end_cursor,
    })
    expect(next.candidates.profile_links.map(link => link.id)).toEqual([newer.profileLinkId])
    expect(next.page_info.has_next_page).toBe(false)
    const beyondIntegerPosition = encodeCursor({
      ...decodeCursor(first.page_info.end_cursor!),
      sort_order: Number.MAX_SAFE_INTEGER,
    })
    const beyond = await getMyLandingPageCandidates(user.id, { after: beyondIntegerPosition })
    expect(beyond.candidates.profile_links).toEqual([])
    expect(beyond.page_info.has_next_page).toBe(false)
    const beforeIntegerPosition = encodeCursor({
      ...decodeCursor(first.page_info.end_cursor!),
      sort_order: Number.MIN_SAFE_INTEGER,
    })
    expect(
      (
        await getMyLandingPageCandidates(user.id, { after: beforeIntegerPosition })
      ).candidates.profile_links.map(link => link.id),
    ).toEqual([older.profileLinkId, newer.profileLinkId])
    const malformedCursor = {
      ...decodeCursor(first.page_info.end_cursor!),
      sort_order: null,
    }
    const malformed = encodeCursor(malformedCursor)
    await expect(getMyLandingPageCandidates(user.id, { after: malformed })).rejects.toMatchObject({
      status: 400,
    })
  })
})
