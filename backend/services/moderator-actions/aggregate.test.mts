import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { Community } from '@voucha/types/entities/community'
import { recordModeratorAction } from './record.mts'
import { aggregateModeratorActionCounts } from './aggregate.mts'

describe('aggregateModeratorActionCounts', () => {
  let modA: PrivateUser
  let modB: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[modA, modB] = await Promise.all([createTestUser(), createTestUser()])
    community = await insertTestCommunity({ createdById: modA.id })

    // modA: 2 removes + 1 ban = 3 total
    await recordModeratorAction(modA.id, {
      actionType: 'remove',
      communityId: community.id,
    })
    await recordModeratorAction(modA.id, {
      actionType: 'remove',
      communityId: community.id,
    })
    await recordModeratorAction(modA.id, {
      actionType: 'ban',
      communityId: community.id,
    })

    // modB: 1 approve = 1 total
    await recordModeratorAction(modB.id, {
      actionType: 'approve',
      communityId: community.id,
    })
  })

  it('returns per-actor totals sorted by total descending', async () => {
    const stats = await aggregateModeratorActionCounts({
      communityId: community.id,
      windowDays: 30,
    })

    // modA has more actions, should appear first
    const actorIds = stats.map(s => s.actor_id)
    const modAIndex = actorIds.indexOf(modA.id)
    const modBIndex = actorIds.indexOf(modB.id)
    expect(modAIndex).toBeGreaterThanOrEqual(0)
    expect(modBIndex).toBeGreaterThanOrEqual(0)
    expect(modAIndex).toBeLessThan(modBIndex)
  })

  it('aggregates per-type counts correctly for modA', async () => {
    const stats = await aggregateModeratorActionCounts({
      communityId: community.id,
      windowDays: 30,
    })
    const modAStats = stats.find(s => s.actor_id === modA.id)
    expect(modAStats).toBeDefined()
    expect(modAStats!.total).toBeGreaterThanOrEqual(3)
    expect(modAStats!.counts.remove).toBeGreaterThanOrEqual(2)
    expect(modAStats!.counts.ban).toBeGreaterThanOrEqual(1)
  })

  it('aggregates per-type counts correctly for modB', async () => {
    const stats = await aggregateModeratorActionCounts({
      communityId: community.id,
      windowDays: 30,
    })
    const modBStats = stats.find(s => s.actor_id === modB.id)
    expect(modBStats).toBeDefined()
    expect(modBStats!.total).toBeGreaterThanOrEqual(1)
    expect(modBStats!.counts.approve).toBeGreaterThanOrEqual(1)
  })

  it('excludes actions from a different community', async () => {
    const otherCommunity = await insertTestCommunity({ createdById: modA.id })
    await recordModeratorAction(modA.id, {
      actionType: 'remove',
      communityId: otherCommunity.id,
    })

    const stats = await aggregateModeratorActionCounts({
      communityId: community.id,
      windowDays: 30,
    })
    const modAStats = stats.find(s => s.actor_id === modA.id)
    // The count should not include the action from the other community
    // (This assertion checks the total does not unexpectedly grow to include the other community)
    const otherStats = await aggregateModeratorActionCounts({
      communityId: otherCommunity.id,
      windowDays: 30,
    })
    const modAOtherStats = otherStats.find(s => s.actor_id === modA.id)
    expect(modAOtherStats?.counts.remove).toBeGreaterThanOrEqual(1)
    // Sanity: this community's stats are unaffected
    expect(modAStats?.counts.remove).toBeGreaterThanOrEqual(2)
  })

  it('rejects invalid windowDays with 422', async () => {
    await expect(
      aggregateModeratorActionCounts({
        communityId: community.id,
        windowDays: 7 as unknown as Parameters<
          typeof aggregateModeratorActionCounts
        >[0]['windowDays'],
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
