import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes, randomInt } from 'node:crypto'
import assert from 'node:assert/strict'
import { createTestUserWithId, insertTestPostVote, insertTestPost } from '@voucha/test-helpers'
import { detectVelocitySpike } from './detect-velocity-spike.mts'
import {
  VELOCITY_SPIKE_THRESHOLD,
  VELOCITY_SPIKE_WINDOW_MINUTES,
  YOUNG_ACCOUNT_AGE_DAYS,
} from './config.mts'
import { v7 as uuidv7 } from 'uuid'
import { getMinUUIDv7ForDate } from '@modules/utils'

const AS_OF_MS = Date.UTC(2026, 1, 1, 0, 2)
const AS_OF = new Date(AS_OF_MS)

describe('detect-velocity-spike', () => {
  const randomUsername = () => `test-vi-vs-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-vs-${randomBytes(6).toString('hex')}`

  let creatorUserId: string

  beforeAll(async () => {
    creatorUserId = uuidv7({ msecs: Date.UTC(2025, 10, 30) })
    await createTestUserWithId(creatorUserId, randomUsername())
  }, 5000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `VS Test ${slug}`,
      slug,
      createdById: creatorUserId,
      createdAt: new Date(Date.UTC(2025, 11, 1)),
      markdown: 'test',
    })
  }

  async function addVote(
    postId: string,
    userAt: number,
    voteAt: number,
    voteId = uuidv7({ msecs: voteAt }),
  ): Promise<void> {
    const userId = uuidv7({ msecs: userAt })
    await createTestUserWithId(userId, randomUsername())
    await insertTestPostVote(postId, userId, 1, voteId)
  }

  describe('detectVelocitySpike', () => {
    it('returns flagged=false when vote count is below threshold', async () => {
      const postId = await makePost(randomSlug())
      const count = VELOCITY_SPIKE_THRESHOLD - 1

      for (let i = 0; i < count; i++) {
        await addVote(postId, AS_OF_MS - 86_400_000, AS_OF_MS - 60_000)
      }

      const result = await detectVelocitySpike('post', postId, AS_OF)
      expect(result.flagged).toBe(false)
    })

    it('returns flagged=true when young-account vote count exceeds threshold', async () => {
      const postId = await makePost(randomSlug())
      const count = VELOCITY_SPIKE_THRESHOLD + 1

      for (let i = 0; i < count; i++) {
        await addVote(postId, AS_OF_MS - 86_400_000, AS_OF_MS - 60_000)
      }

      const result = await detectVelocitySpike('post', postId, AS_OF)
      expect(result.flagged).toBe(true)
      expect(result.details.young_account_vote_count).toBeGreaterThan(VELOCITY_SPIKE_THRESHOLD)
    })

    it('returns correct details shape', async () => {
      const postId = await makePost(randomSlug())
      const result = await detectVelocitySpike('post', postId, AS_OF)
      expect(result).toHaveProperty('flagged')
      expect(result).toHaveProperty('details')
      expect(result.details).toHaveProperty('young_account_vote_count')
      expect(result.details).toHaveProperty('threshold')
      expect(result.details).toHaveProperty('window_minutes')
      expect(result.details).toHaveProperty('young_account_age_days')
    })

    it('includes votes at the five-minute cutoff and excludes the previous millisecond', async () => {
      const postId = await makePost(randomSlug())
      // Keep the five-minute window across the January/February rollover.
      const asOfMs = AS_OF_MS + randomInt(0, 3 * 60_000)
      const cutoff = asOfMs - VELOCITY_SPIKE_WINDOW_MINUTES * 60_000
      for (const offset of [-1, 0, 1]) {
        const voteAt = cutoff + offset
        await addVote(
          postId,
          asOfMs - 86_400_000,
          voteAt,
          offset === 0 ? getMinUUIDv7ForDate(new Date(cutoff)) : uuidv7({ msecs: voteAt }),
        )
      }

      const atCutoff = await detectVelocitySpike('post', postId, new Date(asOfMs))
      const afterCutoff = await detectVelocitySpike('post', postId, new Date(asOfMs + 1))
      assert.equal(
        atCutoff.details.young_account_vote_count,
        2,
        `asOf=${new Date(asOfMs).toISOString()}`,
      )
      assert.equal(
        afterCutoff.details.young_account_vote_count,
        1,
        `asOf=${new Date(asOfMs).toISOString()}`,
      )
    })

    it('includes accounts at the 30-day cutoff and excludes the previous millisecond', async () => {
      const postId = await makePost(randomSlug())
      const asOfMs = AS_OF_MS + randomInt(0, 3 * 60_000)
      const accountCutoff = asOfMs - YOUNG_ACCOUNT_AGE_DAYS * 86_400_000
      for (const offset of [-1, 0, 1]) {
        const userAt = accountCutoff + offset
        const userId =
          offset === 0 ? getMinUUIDv7ForDate(new Date(accountCutoff)) : uuidv7({ msecs: userAt })
        await createTestUserWithId(userId, randomUsername())
        await insertTestPostVote(postId, userId, 1, uuidv7({ msecs: asOfMs - 60_000 }))
      }

      const atCutoff = await detectVelocitySpike('post', postId, new Date(asOfMs))
      const afterCutoff = await detectVelocitySpike('post', postId, new Date(asOfMs + 1))
      assert.equal(
        atCutoff.details.young_account_vote_count,
        2,
        `asOf=${new Date(asOfMs).toISOString()}`,
      )
      assert.equal(
        afterCutoff.details.young_account_vote_count,
        1,
        `asOf=${new Date(asOfMs).toISOString()}`,
      )
    })

    it('rejects an invalid reference instant', async () => {
      const postId = await makePost(randomSlug())
      await expect(detectVelocitySpike('post', postId, new Date(Number.NaN))).rejects.toThrow(
        'asOf must be a finite date',
      )
    })
  })
})
