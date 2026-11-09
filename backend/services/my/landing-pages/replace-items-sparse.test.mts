import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestReview } from '@voucha/test-helpers/entities/topics'
import { createTestLandingPageProfileLinkItem } from '@voucha/test-helpers/entities/landing-pages'
import { runTestLandingPageReplacementRace } from '@voucha/test-helpers/landing-page-replacement-race'
import { deleteProfileLink } from '../profile-links.mts'
import { buildLandingPageInsertRows } from './replace-item-rows.mts'
import { replaceLandingPageItemRows } from './replace-item-writes.mts'
import { createMyLandingPage } from './create.mts'
import { replaceMyLandingPageItems } from './replace-items.mts'
import { getMyLandingPage } from './get.mts'

describe('landing page sparse item replacement', () => {
  it.each(['replace-first', 'clear-first'] as const)(
    'preserves a complete result when %s wins after a real item FK cascade',
    async schedule => {
      const user = await createTestUserDirect()
      const page = await createMyLandingPage(user.id, { title: 'Sparse page', slug: 'sparse' })
      const { profileLinkId } = await createTestLandingPageProfileLinkItem(user.id, page.id)
      const reviews = await Promise.all(
        Array.from({ length: 2 }, () => insertTestReview({ userId: user.id, topicRatings: [] })),
      )
      const items = reviews.map(id => ({ type: 'review' as const, review_post_id: id }))
      await replaceMyLandingPageItems(user.id, page.id, [
        { type: 'profile_link', profile_link_id: profileLinkId },
        ...items,
      ])
      // The real profile-link deletion cascades sort0 away, retaining old positions1 and2.
      await deleteProfileLink(user.id, profileLinkId)
      expect((await getMyLandingPage(user.id, page.id)).items).toHaveLength(2)
      const clearedLast = schedule === 'replace-first'
      const expectedIds = clearedLast ? [] : reviews
      const result = await runTestLandingPageReplacementRace({
        writeHeld: query => {
          const rows = buildLandingPageInsertRows(clearedLast ? items : [], new Map())
          return replaceLandingPageItemRows(query, page.id, rows.itemRows, rows.groupMemberRows)
        },
        queryMarker: 'replaceMyLandingPageItems:lockWrittenItems',
        start: () => replaceMyLandingPageItems(user.id, page.id, clearedLast ? [] : items),
      })
      expect(
        result.items.map(item => (item.type === 'review' ? item.review.id : undefined)),
      ).toEqual(expectedIds)
      expect((await getMyLandingPage(user.id, page.id)).items).toEqual(result.items)
    },
  )
})
