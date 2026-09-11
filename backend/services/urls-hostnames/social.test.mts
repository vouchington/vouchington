import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestUrlHostname,
  insertTestLocalFollow,
  upsertHostnameVote,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { getFriendTrustedHostnames } from './social.mts'

describe('getFriendTrustedHostnames', () => {
  let currentUser: PrivateUser
  let friend1: PrivateUser
  let friend2: PrivateUser
  let strangerUser: PrivateUser
  let hostnameId1: string
  let hostnameId2: string
  let hostnameId3: string
  const random = Math.random().toString(36).slice(2, 10)

  beforeAll(async () => {
    currentUser = await createTestUser()
    friend1 = await createTestUser()
    friend2 = await createTestUser()
    strangerUser = await createTestUser()

    // currentUser follows friend1 and friend2
    await insertTestLocalFollow(currentUser.id, friend1.id)
    await insertTestLocalFollow(currentUser.id, friend2.id)

    hostnameId1 = await insertTestUrlHostname({ hostname: `social-h1-${random}.example.com` })
    hostnameId2 = await insertTestUrlHostname({ hostname: `social-h2-${random}.example.com` })
    hostnameId3 = await insertTestUrlHostname({ hostname: `social-h3-${random}.example.com` })

    // Both friends upvote hostname1
    await upsertHostnameVote(hostnameId1, friend1.id, 1)
    await upsertHostnameVote(hostnameId1, friend2.id, 1)

    // Only friend1 upvotes hostname2
    await upsertHostnameVote(hostnameId2, friend1.id, 1)

    // Stranger upvotes hostname3 (should not appear for currentUser)
    await upsertHostnameVote(hostnameId3, strangerUser.id, 1)
  })

  it('returns hostnames trusted by friends ordered by friend_upvote_count DESC', async () => {
    const { results } = await getFriendTrustedHostnames(currentUser.id, { limit: 100 })
    const ids = results.map(r => r.id)

    expect(ids).toContain(hostnameId1)
    expect(ids).toContain(hostnameId2)

    const h1 = results.find(r => r.id === hostnameId1)!
    const h2 = results.find(r => r.id === hostnameId2)!

    expect(h1.friend_upvote_count).toBe(2)
    expect(h2.friend_upvote_count).toBe(1)

    const h1Idx = ids.indexOf(hostnameId1)
    const h2Idx = ids.indexOf(hostnameId2)
    expect(h1Idx).toBeLessThan(h2Idx)
  })

  it('does not include hostnames only upvoted by strangers', async () => {
    const { results } = await getFriendTrustedHostnames(currentUser.id, { limit: 100 })
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(hostnameId3)
  })

  it('includes friend_voter_ids', async () => {
    const { results } = await getFriendTrustedHostnames(currentUser.id, { limit: 100 })
    const h1 = results.find(r => r.id === hostnameId1)!
    expect(h1.friend_voter_ids).toContain(friend1.id)
    expect(h1.friend_voter_ids).toContain(friend2.id)
  })

  it('supports pagination with after cursor', async () => {
    const first = await getFriendTrustedHostnames(currentUser.id, { limit: 1 })
    expect(first.results).toHaveLength(1)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await getFriendTrustedHostnames(currentUser.id, {
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results[0].id).not.toBe(first.results[0].id)
  })

  it('returns empty results for user with no friends', async () => {
    const lonelyUser = await createTestUser()
    const { results, page_info } = await getFriendTrustedHostnames(lonelyUser.id, { limit: 25 })
    expect(results).toHaveLength(0)
    expect(page_info.has_next_page).toBe(false)
  })

  it('returns 400 for invalid cursor', async () => {
    await expect(
      getFriendTrustedHostnames(currentUser.id, { after: 'notvalid!!' }),
    ).rejects.toThrow(Error)
  })
})
