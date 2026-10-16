import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { recordModeratorAction } from './record.mts'
import { searchModeratorActionCounts } from './search-counts.mts'

describe('bounded moderator action count pages', () => {
  it('pages all actors by total then UUID without losing tied counts', async () => {
    const actors = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const [leader, ...tied] = actors
    const community = await insertTestCommunity({ createdById: leader!.id })
    for (const actor of actors) {
      await recordModeratorAction(actor.id, { communityId: community.id, actionType: 'remove' })
    }
    await recordModeratorAction(leader!.id, { communityId: community.id, actionType: 'ban' })
    const other = await insertTestCommunity({ createdById: leader!.id })
    await recordModeratorAction(leader!.id, { communityId: other.id, actionType: 'approve' })
    await recordModeratorAction(null, { communityId: community.id, actionType: 'approve' })
    const options = { communityId: community.id, windowDays: 30 as const, limit: 1 }
    const first = await searchModeratorActionCounts(options)
    expect(first.stats).toEqual([
      { actor_user_id: leader!.id, total: 2, counts: { remove: 1, ban: 1 } },
    ])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await searchModeratorActionCounts({
      ...options,
      after: first.page_info.end_cursor!,
    })
    const third = await searchModeratorActionCounts({
      ...options,
      after: second.page_info.end_cursor!,
    })
    expect(second.page_info.has_next_page).toBe(true)
    expect(third.page_info.has_next_page).toBe(false)
    expect([...second.stats, ...third.stats]).toEqual(
      tied
        .map(actor => actor.id)
        .toSorted()
        .toReversed()
        .map(actor_user_id => ({ actor_user_id, total: 1, counts: { remove: 1 } })),
    )
  })

  it('rejects malformed cursors and nonpositive count scores before querying', async () => {
    const actor = await createTestUser()
    const options = { communityId: actor.id, windowDays: 30 as const }
    for (const after of ['not-a-cursor', encodeCursor({ id: actor.id, score: 0 })]) {
      await expect(searchModeratorActionCounts({ ...options, after })).rejects.toMatchObject({
        status: 400,
      })
    }
  })
})
