import { it, expect, beforeAll, describe } from 'vitest'
import { createLocalTestUser } from '../../test-helpers/users.mts'
import {
  insertLocalTestGoogleAccount,
  connectLocalTestGoogleAccount,
} from '../../test-helpers/oauth-accounts.mts'
import { insertLocalTestPost } from '../../test-helpers/posts.mts'
import {
  queryEmbeddedUser,
  setUserDisplayNameFrom,
  queryPostCreatedBy,
} from '../test-helpers/view-users.mts'

describe('view-users', () => {
  // Shared user and post created once for the file — avoids firing processUserCreated per test.
  let user: { id: string; username: string | null }
  let testPostId: string

  beforeAll(async () => {
    user = await createLocalTestUser()
    testPostId = await insertLocalTestPost({
      title: `view-users-test-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'test post for view_embedded_users shape validation',
    })
  })

  it('view_embedded_users returns expected concrete field values', async () => {
    const row = await queryEmbeddedUser(user.id)

    expect(row).toBeDefined()
    // Shape
    expect(row?.__entity_type).toBe('user')
    expect(row?.id).toBe(user.id)
    expect(row?.username).toBe(user.username)
    // New user defaults to use_display_name_from = 'username' (no OAuth provider)
    expect(row?.use_display_name_from).toBe('username')
    // 'username' has no CASE branch → display_account is NULL
    expect(row?.display_account).toBeNull()
    expect(row).not.toHaveProperty('individual_id')
    expect(row?.roles).toEqual([])
    expect(row).not.toHaveProperty('is_agent')
    expect(row?.is_official_account).toBe(false)
  })

  it('view_embedded_users returns display_account via CASE scalar subquery when use_display_name_from is set', async () => {
    const googleUser = await createLocalTestUser()
    const googleUserId = `test-google-${crypto.randomUUID()}`
    // Insert google account (unlinked), then connect it to the user
    await insertLocalTestGoogleAccount(googleUserId)
    await connectLocalTestGoogleAccount(googleUser.id, googleUserId)
    // Set use_display_name_from to 'google'
    await setUserDisplayNameFrom(googleUser.id, 'google')

    const row = await queryEmbeddedUser(googleUser.id)

    expect(row).toBeDefined()
    // CASE branch for 'google' fires a scalar subquery and returns the account object
    expect(row?.display_account).not.toBeNull()
    const displayAccount = row?.display_account as Record<string, unknown>
    // OAuth provider IDs are private; v1 keeps a blank id only for decoder compatibility.
    expect(displayAccount.id).toBe('')
    // name comes from google_user_data->>'name'; insertTestOAuthAccount inserts '{}' so name is null
    expect(displayAccount.name).toBeNull()
    // Other providers return null (only the matching CASE branch fires)
    expect(row?.use_display_name_from).toBe('google')
  })

  it('view_posts created_by field uses view_embedded_users shape', async () => {
    // Verify that the inserted post includes the embedded user shape in created_by
    const row = await queryPostCreatedBy(testPostId)

    expect(row).toBeDefined()

    const createdBy = row?.created_by
    expect(createdBy).not.toBeNull()
    expect(createdBy?.id).toBe(user.id)
    expect(createdBy?.username).toBe(user.username)
    expect(createdBy).not.toHaveProperty('individual_id')
    expect(createdBy?.roles).toEqual([])
    expect(createdBy).not.toHaveProperty('is_agent')
    expect(createdBy?.is_official_account).toBe(false)
  })
})
