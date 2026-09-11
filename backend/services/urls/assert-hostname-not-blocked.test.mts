import { it, expect, describe } from 'vitest'
import { assertUrlsHaveNoBlockedHostnames } from './assert-hostname-not-blocked.mts'
import {
  insertTestUrlHostname,
  insertTestUrl,
  createTestUserDirect,
  getTestPenaltiesByUserId,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('assert-hostname-not-blocked', () => {
  it('assertUrlsHaveNoBlockedHostnames passes for non-blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({ hostname: `ok-${random}.example.com` })
    const urlId = await insertTestUrl({ url: `https://ok-${random}.example.com/page`, hostnameId })

    await expect(assertUrlsHaveNoBlockedHostnames([urlId])).resolves.toBeUndefined()
  }, 60_000)

  it('assertUrlsHaveNoBlockedHostnames throws 422 for blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `blocked-${random}.example.com`,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://blocked-${random}.example.com/page`,
      hostnameId,
    })

    const error = await assertUrlsHaveNoBlockedHostnames([urlId]).catch(e => e)
    expect(error.status).toBe(422)
    expect(() => {
      throw error
    }).toThrow(/blocked/)
  }, 60_000)

  it('assertUrlsHaveNoBlockedHostnames passes for empty array', async () => {
    await expect(assertUrlsHaveNoBlockedHostnames([])).resolves.toBeUndefined()
  })

  it('assertUrlsHaveNoBlockedHostnames applies penalty to userId when blocked hostname found', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `blocked-penalty-${random}.example.com`,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://blocked-penalty-${random}.example.com/page`,
      hostnameId,
    })
    const testUser = (await createTestUserDirect({
      username: `ahb-penalty-${random}`,
    })) as PrivateUser

    const error = await assertUrlsHaveNoBlockedHostnames([urlId], testUser.id).catch(e => e)
    expect(error.status).toBe(422)

    const penalties = await getTestPenaltiesByUserId(testUser.id)
    const attemptPenalty = penalties.find(p => p.reason === 'blocked_hostname_attempt')
    expect(attemptPenalty).toBeDefined()
    expect(attemptPenalty!.user_id).toBe(testUser.id)
  }, 60_000)
})
