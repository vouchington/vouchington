import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createSystemUser,
  createTestUserDirect,
  getTestPenaltiesByUserId,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import type { PrivateUser } from '@services/users/types'
import { penalizeBlockedHostnameAttempt } from './penalize-blocked-hostname-attempt.mts'
import { DEFAULT_PENALTY_MULTIPLIER } from '@services/vote-integrity/config'

const rand = () => randomBytes(6).toString('hex')

describe('penalizeBlockedHostnameAttempt', () => {
  let moderationSystemUserId: string

  beforeAll(async () => {
    const moderationSystemUser = await createSystemUser(MODERATION_SYSTEM_USERNAME)
    moderationSystemUserId = moderationSystemUser.id
  })

  it('inserts a penalty with reason blocked_hostname_attempt and correct multiplier', async () => {
    const testUser = (await createTestUserDirect({
      username: `bha-reason-${rand()}`,
    })) as PrivateUser

    await penalizeBlockedHostnameAttempt(testUser.id)

    const penalties = await getTestPenaltiesByUserId(testUser.id)
    expect(penalties.length).toBe(1)

    const penalty = penalties.find(p => p.reason === 'blocked_hostname_attempt')
    expect(penalty).toBeDefined()
    expect(penalty!.user_id).toBe(testUser.id)
    expect(penalty!.created_by_id).toBe(moderationSystemUserId)
    expect(penalty!.penalty_multiplier).toBe(DEFAULT_PENALTY_MULTIPLIER)
    expect(penalty!.revoked_at).toBeNull()
  }, 60_000)

  it('stacks: multiple calls create multiple penalty rows', async () => {
    const testUser = (await createTestUserDirect({
      username: `bha-stack-${rand()}`,
    })) as PrivateUser

    await penalizeBlockedHostnameAttempt(testUser.id)
    await penalizeBlockedHostnameAttempt(testUser.id)
    await penalizeBlockedHostnameAttempt(testUser.id)

    const penalties = await getTestPenaltiesByUserId(testUser.id)
    const attemptPenalties = penalties.filter(p => p.reason === 'blocked_hostname_attempt')
    expect(attemptPenalties.length).toBe(3)
  }, 60_000)

  it('does not affect other users', async () => {
    const penalizedUser = (await createTestUserDirect({
      username: `bha-isolate-${rand()}`,
    })) as PrivateUser
    const otherUser = (await createTestUserDirect({
      username: `bha-other-${rand()}`,
    })) as PrivateUser

    await penalizeBlockedHostnameAttempt(penalizedUser.id)

    const otherPenalties = await getTestPenaltiesByUserId(otherUser.id)
    const attemptPenalties = otherPenalties.filter(p => p.reason === 'blocked_hostname_attempt')
    expect(attemptPenalties.length).toBe(0)
  }, 60_000)
})
