import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'
import { followUser } from '@voucha/test-helpers/entities/test-entities'

describe('GET /api/v1/users/:idOrSlug users collection pagination', () => {
  it('paginates users/following with after cursors', async () => {
    const owner = await createTestUser({ username: safeUsername('users-following-page-owner') })
    const followees = await Promise.all([
      createTestUser({ username: safeUsername('users-following-page-a') }),
      createTestUser({ username: safeUsername('users-following-page-b') }),
      createTestUser({ username: safeUsername('users-following-page-c') }),
    ])
    if (!owner || followees.some(user => !user)) throw new Error('Failed to create users')

    for (const followee of followees) {
      await followUser(owner, followee!)
    }

    const page1 = await createRequest()
      .get(`/api/v1/users/${owner.username}/users/following?limit=2`)
      .expect(200)
    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(typeof page1.body.page_info.end_cursor).toBe('string')

    const page2 = await createRequest()
      .get(
        `/api/v1/users/${owner.username}/users/following?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  it('paginates users/followers with after cursors', async () => {
    const owner = await createTestUser({ username: safeUsername('users-followers-page-owner') })
    const followers = await Promise.all([
      createTestUser({ username: safeUsername('users-followers-page-a') }),
      createTestUser({ username: safeUsername('users-followers-page-b') }),
      createTestUser({ username: safeUsername('users-followers-page-c') }),
    ])
    if (!owner || followers.some(user => !user)) throw new Error('Failed to create users')

    for (const follower of followers) {
      await followUser(follower!, owner)
    }

    const page1 = await createRequest()
      .get(`/api/v1/users/${owner.username}/users/followers?limit=2`)
      .expect(200)
    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)

    const page2 = await createRequest()
      .get(
        `/api/v1/users/${owner.username}/users/followers?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info.has_next_page).toBe(false)
  })
})
