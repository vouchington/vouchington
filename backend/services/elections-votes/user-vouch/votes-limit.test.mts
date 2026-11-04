import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, getFollowExists, insertTestLocalFollow } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertUserVouchElectionVotes } from './votes-upsert.mts'
import { getUserVouchElectionVote } from './votes-get.mts'

describe('vouch at follow capacity', () => {
  it('records the vote without creating a follow', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_user: 1 }))
    const [voter, followed, target] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await insertTestLocalFollow(voter.id, followed.id)
    await upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: 1 }])
    expect(await getUserVouchElectionVote(voter.id, target.id)).toMatchObject({ choice: 'like' })
    expect(await getFollowExists(voter.id, target.id)).toBe(false)
  })
})
