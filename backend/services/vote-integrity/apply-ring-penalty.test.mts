import { describe, it, expect, beforeAll } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  createTestUser,
  insertTestPostVote,
  insertTestPost,
  getTestPenaltiesByFlagId,
} from '@voucha/test-helpers'
import { createVoteIntegrityFlag } from './create-flag.mts'
import { getVoteIntegrityFlagByIdFromPrimary } from './get-flags.mts'
import { applyVoteRingPenalty } from './apply-ring-penalty.mts'
import { DEFAULT_PENALTY_MULTIPLIER } from './config.mts'
import { revokeVoteWeightPenalty } from './revoke-penalty.mts'
import type { PrivateUser } from '@services/users/types'

describe('apply-ring-penalty', () => {
  const randomUsername = () => `test-vi-arp-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-arp-${randomBytes(6).toString('hex')}`

  let adminUser: PrivateUser
  let creatorUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, creatorUser] = await Promise.all([
      createTestUser({ administrator: true }) as Promise<PrivateUser>,
      createTestUserDirect({ username: randomUsername() }) as Promise<PrivateUser>,
    ])
  }, 60_000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `ARP Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })
  }

  describe('applyVoteRingPenalty', () => {
    it('creates penalties for all upvoters of the flagged entity', async () => {
      const postId = await makePost(randomSlug())

      const upvoters = await Promise.all(
        Array.from({ length: 3 }, () => createTestUserDirect({ username: randomUsername() })),
      )
      for (const user of upvoters) {
        await insertTestPostVote(postId, user!.id, '9.9.9.9', 1)
      }

      // Downvoter should not be penalized
      const downvoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestPostVote(postId, downvoter!.id, '9.9.9.9', -1)

      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      expect(flag).not.toBeNull()

      const result = await applyVoteRingPenalty(flag!.id, adminUser.id)
      expect(result.penalized_user_count).toBe(3)

      // Verify penalties have the correct multiplier
      const penalties = await getTestPenaltiesByFlagId(flag!.id)
      expect(penalties).toHaveLength(3)
      for (const penalty of penalties) {
        expect(penalty.penalty_multiplier).toBe(DEFAULT_PENALTY_MULTIPLIER)
        expect(penalty.reason).toBe('voting_ring')
        expect(penalty.revoked_at).toBeNull()
      }

      const unchangedFlag = await getVoteIntegrityFlagByIdFromPrimary(flag!.id)
      expect(unchangedFlag).toMatchObject({
        id: flag!.id,
        resolution: null,
        resolved_at: null,
        resolved_by_id: null,
      })
    }, 60_000)

    it('returns penalized_user_count=0 when no upvoters exist', async () => {
      const postId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', postId, 'velocity_spike', {})
      expect(flag).not.toBeNull()

      const result = await applyVoteRingPenalty(flag!.id, adminUser.id)
      expect(result.penalized_user_count).toBe(0)
    }, 60_000)

    it('throws 404 for unknown flag ID', async () => {
      await expect(applyVoteRingPenalty(uuidv7(), adminUser.id)).rejects.toThrow(Error)
    }, 60_000)

    it('can reapply a flag-sourced penalty after the previous penalty is revoked', async () => {
      const postId = await makePost(randomSlug())
      const upvoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestPostVote(postId, upvoter!.id, '9.9.9.9', 1)

      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      expect(flag).not.toBeNull()

      await expect(applyVoteRingPenalty(flag!.id, adminUser.id)).resolves.toEqual({
        penalized_user_count: 1,
      })
      const [firstPenalty] = await getTestPenaltiesByFlagId(flag!.id)
      expect(firstPenalty).toBeDefined()

      await revokeVoteWeightPenalty(firstPenalty!.id, adminUser.id)
      await expect(applyVoteRingPenalty(flag!.id, adminUser.id)).resolves.toEqual({
        penalized_user_count: 1,
      })

      const penalties = await getTestPenaltiesByFlagId(flag!.id)
      expect(penalties).toHaveLength(2)
      expect(penalties.filter(p => p.revoked_at === null)).toHaveLength(1)
    }, 60_000)
  })
})
