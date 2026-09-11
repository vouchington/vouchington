import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestUserDirect, insertTestPostVote, insertTestPost } from '@voucha/test-helpers'
import { detectIpCorrelation } from './detect-ip-correlation.mts'
import { IP_CORRELATION_THRESHOLD } from './config.mts'
import type { PrivateUser } from '@services/users/types'

describe('detect-ip-correlation', () => {
  const randomUsername = () => `test-vi-ip-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-ip-${randomBytes(6).toString('hex')}`

  let creatorUser: PrivateUser

  beforeAll(async () => {
    creatorUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `IP Corr Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })
  }

  describe('detectIpCorrelation', () => {
    it('returns flagged=false when fewer than threshold users share an IP', async () => {
      const postId = await makePost(randomSlug())
      const sharedIp = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.1`
      const usersToCreate = IP_CORRELATION_THRESHOLD - 1

      for (let i = 0; i < usersToCreate; i++) {
        const user = await createTestUserDirect({ username: randomUsername() })
        await insertTestPostVote(postId, user!.id, sharedIp, 1)
      }

      const result = await detectIpCorrelation('post', postId)
      expect(result.flagged).toBe(false)
    }, 60_000)

    it('returns flagged=true when threshold or more users share an IP', async () => {
      const postId = await makePost(randomSlug())
      const sharedIp = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.2`

      for (let i = 0; i < IP_CORRELATION_THRESHOLD; i++) {
        const user = await createTestUserDirect({ username: randomUsername() })
        await insertTestPostVote(postId, user!.id, sharedIp, 1)
      }

      const result = await detectIpCorrelation('post', postId)
      expect(result.flagged).toBe(true)
      expect(result.details.correlated_ips).toHaveLength(1)
      expect(result.details.correlated_ips[0]?.ip_address).toBe(sharedIp)
      expect(result.details.correlated_ips[0]?.distinct_user_count).toBeGreaterThanOrEqual(
        IP_CORRELATION_THRESHOLD,
      )
    }, 60_000)

    it('returns correct details shape', async () => {
      const postId = await makePost(randomSlug())
      const result = await detectIpCorrelation('post', postId)
      expect(result).toHaveProperty('flagged')
      expect(result).toHaveProperty('details')
      expect(result.details).toHaveProperty('correlated_ips')
      expect(result.details).toHaveProperty('threshold')
      expect(result.details).toHaveProperty('window_minutes')
      expect(Array.isArray(result.details.correlated_ips)).toBe(true)
    }, 60_000)
  })
})
