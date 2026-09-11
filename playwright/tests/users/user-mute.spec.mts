import { type Page, expect, test } from '../../helpers/test.mts'
import { TEST_USER_USERNAME, withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { createTestUser, insertTestLocalFollow } from '../../../backend/test-helpers/index.mts'

function waitForMuteRequest(page: Page, method: 'PUT' | 'DELETE') {
  return page.waitForResponse(
    r =>
      r.ok() &&
      r.url().includes('/api/v1/bookmarks/user/') &&
      r.url().endsWith('/mute') &&
      r.request().method() === method,
  )
}

// Toggle test uses a fresh isolated viewer and target so the muted/unmuted state
// is deterministic regardless of the shared seeded user's prior mute relations.
test.describe('User mute aside — toggle', () => {
  test('signed-in viewer can mute and unmute another user from their profile aside', async ({
    page,
  }) => {
    // Use a fresh isolated viewer (no prior mute relations) and a fresh target
    // user so this test is deterministic regardless of prior run state.
    // Return value unused — withCleanUser authenticates the page session; all
    // interaction is driven through the browser UI, not the PrivateUser object.
    await withCleanUser(page)
    const target = requireTestValue(
      await createTestUser({ username: `pw-mute-target-${randomSuffix()}` }),
      'Failed to create mute target user',
    )
    await navigateTo(page, `/user/${target.username}`)

    const aside = page.getByRole('complementary')

    const muteButton = aside.getByTestId('user-mute-button')
    await expect(muteButton).toBeEnabled()
    await expect(muteButton).toContainText('Mute')

    const putResponse = waitForMuteRequest(page, 'PUT')
    await muteButton.click()
    await putResponse

    await expect(muteButton).toContainText('Muted')
    await expect(muteButton).toBeEnabled()

    const deleteResponse = waitForMuteRequest(page, 'DELETE')
    await muteButton.click()
    await deleteResponse

    await expect(muteButton).toContainText('Mute')
    await expect(muteButton).toBeEnabled()
  })
})

// Structural tests check that the profile-aside mute button never appears on the
// viewer's own profile, and that the row-level mute button appears in list views.
test.describe('User mute aside — structural absence', () => {
  test.use({ storageState: AUTH_STATE })

  test('signed-in viewer sees no mute button on their own profile', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    await expect(page.getByTestId('user-mute-button')).toHaveCount(0)
  })
})

// Row-level mute button tests verify the mute affordance in user list views.
// These use fresh isolated users so the mute state is deterministic.
test.describe('User mute row — list views', () => {
  test('signed-in viewer sees row mute button on user search results for other users', async ({
    page,
  }) => {
    await withCleanUser(page)
    const target = requireTestValue(
      await createTestUser({ username: `pw-mute-row-target-${randomSuffix()}` }),
      'Failed to create mute row target user',
    )

    await navigateTo(page, `/users?q=${encodeURIComponent(target.username ?? '')}`)

    const rowMuteButton = page.getByTestId('user-search-result-mute-button')
    await expect(rowMuteButton).toHaveCount(1)
    await expect(rowMuteButton).toContainText('Mute')
  })

  test('signed-in viewer sees row mute button on followers list for other users', async ({
    page,
  }) => {
    // withCleanUser authenticates the page as a fresh viewer; return value not needed
    await withCleanUser(page)
    const profileOwner = await createTestUser({
      username: `pw-mute-list-owner-${randomSuffix()}`,
    })
    const follower = await createTestUser({ username: `pw-mute-list-follower-${randomSuffix()}` })
    const owner = requireTestValue(profileOwner, 'Failed to create test users for list mute test')
    const listFollower = requireTestValue(
      follower,
      'Failed to create test users for list mute test',
    )
    // Make follower follow profileOwner so the followers list is non-empty
    await insertTestLocalFollow(listFollower.id, owner.id)

    await navigateTo(page, `/user/${owner.username}/users/followers`)

    // follower row should show the list mute button (viewer !== follower)
    const rowMuteButton = page.getByTestId('user-list-mute-button')
    await expect(rowMuteButton).toHaveCount(1)
    await expect(rowMuteButton).toContainText('Mute')
  })
})
