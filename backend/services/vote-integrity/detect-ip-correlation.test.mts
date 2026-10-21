import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes, randomInt } from 'node:crypto'
import assert from 'node:assert/strict'
import { createTestUserWithId, insertTestPostVote, insertTestPost } from '@voucha/test-helpers'
import { detectIpCorrelation } from './detect-ip-correlation.mts'
import { IP_CORRELATION_THRESHOLD, IP_CORRELATION_WINDOW_MINUTES } from './config.mts'
import { v7 as uuidv7 } from 'uuid'
import { getMinUUIDv7ForDate } from '@modules/utils'

const AS_OF_MS = Date.UTC(2026, 1, 1, 0, 2)
const AS_OF = new Date(AS_OF_MS)

describe('detect-ip-correlation', () => {
  const randomUsername = () => `test-vi-ip-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-ip-${randomBytes(6).toString('hex')}`

  let creatorUserId: string

  beforeAll(async () => {
    creatorUserId = uuidv7({ msecs: Date.UTC(2025, 10, 30) })
    await createTestUserWithId(creatorUserId, randomUsername())
  }, 5000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `IP Corr Test ${slug}`,
      slug,
      createdById: creatorUserId,
      createdAt: new Date(Date.UTC(2025, 11, 1)),
      markdown: 'test',
    })
  }

  async function addVote(
    postId: string,
    ip: string,
    voteAt: number,
    voteId = uuidv7({ msecs: voteAt }),
  ): Promise<void> {
    const userId = uuidv7({ msecs: AS_OF_MS - 86_400_000 })
    await createTestUserWithId(userId, randomUsername())
    await insertTestPostVote(postId, userId, ip, 1, voteId)
  }

  describe('detectIpCorrelation', () => {
    it('returns flagged=false when fewer than threshold users share an IP', async () => {
      const postId = await makePost(randomSlug())
      const sharedIp = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.1`
      const usersToCreate = IP_CORRELATION_THRESHOLD - 1

      for (let i = 0; i < usersToCreate; i++) {
        await addVote(postId, sharedIp, AS_OF_MS - 60_000)
      }

      const result = await detectIpCorrelation('post', postId, AS_OF)
      expect(result.flagged).toBe(false)
    })

    it('returns flagged=true when threshold or more users share an IP', async () => {
      const postId = await makePost(randomSlug())
      const sharedIp = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.2`

      for (let i = 0; i < IP_CORRELATION_THRESHOLD; i++) {
        await addVote(postId, sharedIp, AS_OF_MS - 60_000)
      }

      const result = await detectIpCorrelation('post', postId, AS_OF)
      expect(result.flagged).toBe(true)
      expect(result.details.correlated_ips).toHaveLength(1)
      expect(result.details.correlated_ips[0]?.ip_address).toBe(sharedIp)
      expect(result.details.correlated_ips[0]?.distinct_user_count).toBeGreaterThanOrEqual(
        IP_CORRELATION_THRESHOLD,
      )
    })

    it('returns correct details shape', async () => {
      const postId = await makePost(randomSlug())
      const result = await detectIpCorrelation('post', postId, AS_OF)
      expect(result).toHaveProperty('flagged')
      expect(result).toHaveProperty('details')
      expect(result.details).toHaveProperty('correlated_ips')
      expect(result.details).toHaveProperty('threshold')
      expect(result.details).toHaveProperty('window_minutes')
      expect(Array.isArray(result.details.correlated_ips)).toBe(true)
    })

    it('includes votes at the one-hour cutoff and excludes the previous millisecond', async () => {
      const postId = await makePost(randomSlug())
      const sharedIp = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.3`
      const asOfMs = AS_OF_MS + randomInt(0, 58 * 60_000)
      const cutoff = asOfMs - IP_CORRELATION_WINDOW_MINUTES * 60_000
      for (const offset of [-1, 0, 1, 1]) {
        const voteAt = cutoff + offset
        await addVote(
          postId,
          sharedIp,
          voteAt,
          offset === 0 ? getMinUUIDv7ForDate(new Date(cutoff)) : uuidv7({ msecs: voteAt }),
        )
      }

      const atCutoff = await detectIpCorrelation('post', postId, new Date(asOfMs))
      const afterCutoff = await detectIpCorrelation('post', postId, new Date(asOfMs + 1))
      assert.equal(atCutoff.flagged, true, `asOf=${new Date(asOfMs).toISOString()}`)
      expect(atCutoff.details.correlated_ips[0]?.distinct_user_count).toBe(3)
      expect(afterCutoff.flagged).toBe(false)
      expect(afterCutoff.details.correlated_ips).toEqual([])
    })

    it('rejects an invalid reference instant', async () => {
      const postId = await makePost(randomSlug())
      await expect(detectIpCorrelation('post', postId, new Date(Number.NaN))).rejects.toThrow(
        'asOf must be a finite date',
      )
    })
  })
})
