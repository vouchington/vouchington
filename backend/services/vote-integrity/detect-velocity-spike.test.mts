import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestUserDirect, insertTestPostVote, insertTestPost } from '@voucha/test-helpers'
import { detectVelocitySpike } from './detect-velocity-spike.mts'
import { VELOCITY_SPIKE_THRESHOLD } from './config.mts'
import type { PrivateUser } from '@services/users/types'

describe('detect-velocity-spike', () => {
  const randomUsername = () => `test-vi-vs-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-vs-${randomBytes(6).toString('hex')}`

  let creatorUser: PrivateUser

  beforeAll(async () => {
    creatorUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `VS Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })
  }

  describe('detectVelocitySpike', () => {
    it('returns flagged=false when vote count is below threshold', async () => {
      const postId = await makePost(randomSlug())
      const ip = '1.2.3.4'
      const count = VELOCITY_SPIKE_THRESHOLD - 1

      for (let i = 0; i < count; i++) {
        const user = await createTestUserDirect({ username: randomUsername() })
        await insertTestPostVote(postId, user!.id, ip, 1)
      }

      const result = await detectVelocitySpike('post', postId)
      expect(result.flagged).toBe(false)
    }, 60_000)

    it('returns flagged=true when young-account vote count exceeds threshold', async () => {
      const postId = await makePost(randomSlug())
      const ip = '5.6.7.8'
      const count = VELOCITY_SPIKE_THRESHOLD + 1

      for (let i = 0; i < count; i++) {
        const user = await createTestUserDirect({ username: randomUsername() })
        await insertTestPostVote(postId, user!.id, ip, 1)
      }

      const result = await detectVelocitySpike('post', postId)
      expect(result.flagged).toBe(true)
      expect(result.details.young_account_vote_count).toBeGreaterThan(VELOCITY_SPIKE_THRESHOLD)
    }, 60_000)

    it('returns correct details shape', async () => {
      const postId = await makePost(randomSlug())
      const result = await detectVelocitySpike('post', postId)
      expect(result).toHaveProperty('flagged')
      expect(result).toHaveProperty('details')
      expect(result.details).toHaveProperty('young_account_vote_count')
      expect(result.details).toHaveProperty('threshold')
      expect(result.details).toHaveProperty('window_minutes')
      expect(result.details).toHaveProperty('young_account_age_days')
    }, 60_000)
  })
})
