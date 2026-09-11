import { type Page, expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { getAsideLocator } from '../../helpers/aside-locator.mts'

function waitForBlockRequest(page: Page, method: 'PUT' | 'DELETE') {
  return page.waitForResponse(
    r =>
      r.ok() &&
      r.url().includes('/api/v1/bookmarks/user/') &&
      r.url().endsWith('/block') &&
      r.request().method() === method,
  )
}

test.describe('User block aside — toggle', () => {
  test('signed-in viewer can block and unblock another user from their profile aside', async ({
    page,
  }) => {
    await withCleanUser(page)
    const target = requireTestValue(
      await createTestUser({ username: `pw-block-target-${randomSuffix()}` }),
      'Failed to create block target user',
    )
    await navigateTo(page, `/user/${target.username}`)

    const blockButton = getAsideLocator(page, 'user-block-button')
    await expect(blockButton).toBeEnabled()
    await expect(blockButton).toContainText('Block')

    const putResponse = waitForBlockRequest(page, 'PUT')
    await blockButton.click()
    await putResponse

    await expect(blockButton).toContainText('Blocked')
    await expect(blockButton).toBeEnabled()

    const deleteResponse = waitForBlockRequest(page, 'DELETE')
    await blockButton.click()
    await deleteResponse

    await expect(blockButton).toContainText('Block')
    await expect(blockButton).toBeEnabled()
  })
})
