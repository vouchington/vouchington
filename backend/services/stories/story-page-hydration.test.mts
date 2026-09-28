import { describe, expect, it } from 'vitest'
import { upsertRssFeedItemElectionVotes } from '@services/elections-votes/rss-feed-item'
import { createTestUser } from '@voucha/test-helpers'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { enableQueryCapture, stopTestQueryCapture } from '@voucha/test-helpers/query-capture'
import { hydrateStoryMemberPage } from './story-page-hydration.mts'

describe('story page hydration', () => {
  it('returns only the page vote and skips the lookup when the page is empty', async () => {
    const user = await createTestUser()
    const voted = await createTestStoryMembers(1)
    const itemId = voted.itemIds[0]!
    await upsertRssFeedItemElectionVotes(user.id, [{ entityId: itemId, score: 1 }])
    const page = await hydrateStoryMemberPage(user, voted.story.id, [itemId])
    expect(Object.keys(page.election_votes)).toEqual([itemId])

    const empty = await createTestStoryMembers(0)
    enableQueryCapture()
    let hydrated
    try {
      hydrated = await hydrateStoryMemberPage(user, empty.story.id, [])
    } finally {
      const queries = stopTestQueryCapture()
      expect(queries.some(query => query.text.includes('/* fetchElectionVoteRowsByUser */'))).toBe(
        false,
      )
    }
    expect(hydrated!.election_votes).toEqual({})
  })
})
