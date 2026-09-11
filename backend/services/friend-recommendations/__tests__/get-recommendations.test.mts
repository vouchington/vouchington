import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  insertTestFriend,
  insertEntityRelation,
  softDeleteEntityRelationTest,
} from '@voucha/test-helpers'
import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'
import { getFriendRecommendations } from '../get-recommendations.mts'
import { updateUserFields } from '@services/users/update-fields'
import { decodeCursor, encodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

const followTable = getEntityRelationTableNameOrThrow({
  subjectType: 'user',
  objectType: 'user',
  predicate: 'follow',
})

const dismissTable = getEntityRelationTableNameOrThrow({
  subjectType: 'user',
  objectType: 'user',
  predicate: 'dismiss_recommendation',
})

describe('getFriendRecommendations', () => {
  // Current user and their github account
  let currentUser: PrivateUser
  const currentGithubId = String(Math.floor(Math.random() * 1_000_000) + 400_000_000)

  // A friend who is also on the platform
  let friendUser: PrivateUser
  const friendGithubId = String(Math.floor(Math.random() * 1_000_000) + 500_000_000)

  // A second friend for pagination tests
  let friend2User: PrivateUser
  const friend2GithubId = String(Math.floor(Math.random() * 1_000_000) + 600_000_000)

  beforeAll(async () => {
    currentUser = await createTestUser()
    friendUser = await createTestUser()
    friend2User = await createTestUser()

    // Set up github accounts
    await insertTestOAuthAccount('github', currentGithubId, null)
    await connectTestOAuthAccount('github', currentUser.id, currentGithubId)

    await insertTestOAuthAccount('github', friendGithubId, null)
    await connectTestOAuthAccount('github', friendUser.id, friendGithubId)

    await insertTestOAuthAccount('github', friend2GithubId, null)
    await connectTestOAuthAccount('github', friend2User.id, friend2GithubId)

    // Insert github friendship: currentUser follows friendUser and friend2User
    await insertTestFriend('github', currentGithubId, friendGithubId)
    await insertTestFriend('github', currentGithubId, friend2GithubId)
  })

  it('returns friend recommendations', async () => {
    const result = await getFriendRecommendations(currentUser)

    expect(result.results).toBeDefined()
    expect(Array.isArray(result.results)).toBe(true)

    const friendIds = result.results.map(r => r.id)
    expect(friendIds).toContain(friendUser.id)
    expect(friendIds).toContain(friend2User.id)
  })

  it('does not include current user in recommendations', async () => {
    const result = await getFriendRecommendations(currentUser)
    const ids = result.results.map(r => r.id)
    expect(ids).not.toContain(currentUser.id)
  })

  it('includes correct provider info', async () => {
    const result = await getFriendRecommendations(currentUser)
    const rec = result.results.find(r => r.id === friendUser.id)
    expect(rec?.provider).toBe('github')
    expect(rec?.__entity_type).toBe('user')
  })

  it('excludes followed users', async () => {
    await insertEntityRelation(followTable, currentUser.id, friendUser.id)

    const result = await getFriendRecommendations(currentUser)
    const ids = result.results.map(r => r.id)
    expect(ids).not.toContain(friendUser.id)

    await softDeleteEntityRelationTest(followTable, currentUser.id, friendUser.id)
  })

  it('excludes dismissed users', async () => {
    await insertEntityRelation(dismissTable, currentUser.id, friend2User.id)

    const result = await getFriendRecommendations(currentUser)
    const ids = result.results.map(r => r.id)
    expect(ids).not.toContain(friend2User.id)

    await softDeleteEntityRelationTest(dismissTable, currentUser.id, friend2User.id)
  })

  it('returns page_info', async () => {
    const result = await getFriendRecommendations(currentUser)
    expect(result.page_info).toBeDefined()
    expect(typeof result.page_info.has_next_page).toBe('boolean')
  })

  it('supports limit parameter', async () => {
    const result = await getFriendRecommendations(currentUser, { limit: 1 })
    expect(result.results.length).toBe(1)
    expect(result.page_info.has_next_page).toBe(true)
    expect(result.page_info.end_cursor).toBeTruthy()
  })

  it('supports cursor-based pagination', async () => {
    const page1 = await getFriendRecommendations(currentUser, { limit: 1 })

    if (!page1.page_info.has_next_page || !page1.page_info.end_cursor) {
      // Not enough results to paginate in this test context; skip
      return
    }

    const page2 = await getFriendRecommendations(currentUser, {
      limit: 1,
      after: page1.page_info.end_cursor,
    })

    // Pages should not overlap
    const page1Ids = page1.results.map(r => r.id)
    const page2Ids = page2.results.map(r => r.id)
    const overlap = page1Ids.filter(id => page2Ids.includes(id))
    expect(overlap).toHaveLength(0)

    expect(decodeCursor(page1.page_info.start_cursor!)).toEqual({
      id: page1.results[0]!.id,
      scope: JSON.stringify({
        resource: 'my-friend-recommendations',
        owner_id: currentUser.id,
        order: 'id-asc',
      }),
    })
  })

  it('accepts legacy simple cursors during migration', async () => {
    const firstPage = await getFriendRecommendations(currentUser, { limit: 1 })
    const legacyCursor = encodeCursor({ id: firstPage.results[0]!.id })

    const nextPage = await getFriendRecommendations(currentUser, {
      limit: 1,
      after: legacyCursor,
    })

    expect(nextPage.used_legacy_cursor).toBe(true)
    expect(nextPage.results).not.toContainEqual(
      expect.objectContaining({ id: firstPage.results[0]!.id }),
    )
  })

  it('rejects a scoped cursor issued to another user', async () => {
    const firstPage = await getFriendRecommendations(currentUser, { limit: 1 })
    const anotherUser = await createTestUser()

    await expect(
      getFriendRecommendations(anotherUser, {
        after: firstPage.page_info.start_cursor!,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('excludes users with processing_restricted_at set', async () => {
    // Set up isolated users and github accounts for this test
    const viewerUser: PrivateUser = await createTestUser()
    const restrictedUser: PrivateUser = await createTestUser()
    const unrestricted: PrivateUser = await createTestUser()

    const viewerGithubId = String(Math.floor(Math.random() * 1_000_000) + 100_000_000)
    const restrictedGithubId = String(Math.floor(Math.random() * 1_000_000) + 200_000_000)
    const unrestrictedGithubId = String(Math.floor(Math.random() * 1_000_000) + 300_000_000)

    await insertTestOAuthAccount('github', viewerGithubId, null)
    await connectTestOAuthAccount('github', viewerUser.id, viewerGithubId)

    await insertTestOAuthAccount('github', restrictedGithubId, null)
    await connectTestOAuthAccount('github', restrictedUser.id, restrictedGithubId)

    await insertTestOAuthAccount('github', unrestrictedGithubId, null)
    await connectTestOAuthAccount('github', unrestricted.id, unrestrictedGithubId)

    // Both are github friends of the viewer
    await insertTestFriend('github', viewerGithubId, restrictedGithubId)
    await insertTestFriend('github', viewerGithubId, unrestrictedGithubId)

    // Restrict processing for restrictedUser
    await updateUserFields(restrictedUser.id, { processing_restricted_at: true })

    const result = await getFriendRecommendations(viewerUser)
    const ids = result.results.map(r => r.id)

    // The restricted user must not appear in recommendations
    expect(ids).not.toContain(restrictedUser.id)

    // The unrestricted user must appear in recommendations
    expect(ids).toContain(unrestricted.id)
  })
})
