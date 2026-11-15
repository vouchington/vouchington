import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import {
  insertTestModeratorWorkloadDailyTotal,
  insertTestReportingRemovalsBefore,
} from '../../test-helpers/reporting-daily-rollups.mts'
import { getModeratorWorkload } from './moderation-analytics-workload.mts'

describe('getModeratorWorkload', () => {
  it('merges rolling first-day actions, completed daily totals and live today without overlap', async () => {
    const actor = await createTestUser()
    const community = await insertTestCommunity({ createdById: actor.id })
    const now = new Date()
    now.setUTCHours(12, 0, 0, 0)
    const start = new Date(now)
    start.setUTCDate(start.getUTCDate() - 7)
    const completed = new Date(start)
    completed.setUTCDate(completed.getUTCDate() + 1)
    completed.setUTCHours(0, 0, 0, 0)
    const today = new Date(now)
    today.setUTCHours(0, 0, 0, 0)
    for (const [occurredAt, actionType] of [
      [start, 'approve'],
      [completed, 'remove'],
      [today, 'approve'],
    ] as const) {
      await insertTestModeratorAction({
        actorId: actor.id,
        communityId: community.id,
        occurredAt,
        actionType,
      })
    }
    await insertTestReportingRemovalsBefore(actor.id, community.id, start)
    for (const [date, actionType, count] of [
      [start, 'remove', 50],
      [completed, 'remove', 1],
    ] as const) {
      await insertTestModeratorWorkloadDailyTotal({
        day: date.toISOString().slice(0, 10),
        communityId: community.id,
        actorUserId: actor.id,
        actionType,
        count,
      })
    }

    const workload = await getModeratorWorkload(
      start,
      { type: 'community', communityId: community.id },
      now,
    )
    expect(workload.users).toEqual({})
    expect(workload.moderators).toEqual([
      {
        actor_user_id: actor.id,
        total: 3,
        counts: { approve: 2, remove: 1 },
        weekly_counts: expect.any(Array),
      },
    ])
    const firstMonday = new Date(start)
    firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7))
    const lastMonday = new Date(today)
    lastMonday.setUTCDate(lastMonday.getUTCDate() - ((lastMonday.getUTCDay() + 6) % 7))
    const completedMonday = new Date(completed)
    completedMonday.setUTCDate(
      completedMonday.getUTCDate() - ((completedMonday.getUTCDay() + 6) % 7),
    )
    expect(workload.moderators[0]!.weekly_counts).toEqual(
      [
        { date: firstMonday.toISOString().slice(0, 10), type: 'approve', count: 1 },
        { date: completedMonday.toISOString().slice(0, 10), type: 'remove', count: 1 },
        { date: lastMonday.toISOString().slice(0, 10), type: 'approve', count: 1 },
      ].toSorted((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type)),
    )
    const todayWorkload = await getModeratorWorkload(
      today,
      { type: 'community', communityId: community.id },
      now,
    )
    expect(todayWorkload.moderators).toEqual([
      expect.objectContaining({ actor_user_id: actor.id, total: 1, counts: { approve: 1 } }),
    ])
  })
})
