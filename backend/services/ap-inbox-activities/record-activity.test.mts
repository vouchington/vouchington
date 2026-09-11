import { describe, it, expect } from 'vitest'
import { recordInboxActivity } from './record-activity.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('recordInboxActivity', () => {
  it('returns true the first time an activity id is recorded', async () => {
    const activityId = `https://remote.example/activities/${randomSuffix()}`

    const isFirstSeen = await recordInboxActivity(
      activityId,
      'Follow',
      'https://remote.example/users/alice',
    )

    expect(isFirstSeen).toBe(true)
  })

  it('returns false on a replay of the same activity id', async () => {
    const activityId = `https://remote.example/activities/${randomSuffix()}`

    await recordInboxActivity(activityId, 'Follow', 'https://remote.example/users/alice')
    const isReplay = await recordInboxActivity(
      activityId,
      'Follow',
      'https://remote.example/users/alice',
    )

    expect(isReplay).toBe(false)
  })

  it('treats activity ids as unique regardless of recorded type/actor', async () => {
    const activityId = `https://remote.example/activities/${randomSuffix()}`

    await recordInboxActivity(activityId, 'Follow', 'https://remote.example/users/alice')
    const isReplay = await recordInboxActivity(
      activityId,
      'Undo',
      'https://remote.example/users/mallory',
    )

    expect(isReplay).toBe(false)
  })
})
