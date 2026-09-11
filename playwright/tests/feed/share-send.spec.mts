import { expect, test, type Page, withMonitoredPage } from '../../helpers/test.mts'
import { createTestUser, followUser, insertTestPost } from '../../../backend/test-helpers/index.mts'
import { createDeviceAndSessionTokens } from '../../../backend/services/jwt-session/index.mts'
import { processFollowerDistributionChunk } from '../../../backend/services/follower-distributions/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { read } from '../../../backend/data-stores/psql/clients.mts'
import { mintUUIDv7 } from '../../../ts-shared/session-jwt/index.mts'
let sharerId = ''
let followerId = ''
let sharerUsername = ''
let sharedPostId = ''
let sharedPostSlug = ''
let sharedPostTitle = ''
let sendPostId = ''
let sendPostSlug = ''
let sendPostTitle = ''

async function loginAsUser(page: Page, userId: string) {
  // ast-grep-ignore: playwright-no-raw-goto -- loginAsUser only needs a fast root-page navigation to establish an origin for cookie injection, and avoids navigateTo()'s broader wait behavior
  await page.goto('/', { waitUntil: 'load' })

  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did: mintUUIDv7(),
    uid: userId,
  })
  const origin = new URL(page.url()).origin

  await page.context().addCookies([
    {
      name: 'dt',
      value: deviceToken.token,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'st',
      value: sessionToken.token,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  await page.reload()
}

async function processLatestPostDistribution(action: 'post_share' | 'post_send', postId: string) {
  await expect
    .poll(async () => {
      const { rows } = await read<{ id: string }>(
        `/* share-send-spec follower distribution */
        SELECT id
        FROM follower_distributions
        WHERE sender_user_id = $1
          AND action = $2
          AND post_id = $3
        ORDER BY id DESC
        LIMIT 1
      `,
        [sharerId, action, postId],
      )
      const distributionId = rows[0]?.id
      if (!distributionId) return false

      const result = await processFollowerDistributionChunk(distributionId)
      return result.completed
    })
    .toBe(true)
}

test.beforeAll(async () => {
  const random = randomSuffix()

  const creator = await createTestUser({ username: `share-creator-${random}` })
  const sharer = await createTestUser({ username: `share-sender-${random}` })
  const follower = await createTestUser({ username: `share-follower-${random}` })
  if (!creator || !sharer || !follower) {
    throw new Error('Failed to create test users')
  }

  sharerId = sharer.id
  followerId = follower.id
  sharerUsername = sharer.username ?? ''
  if (!sharerId || !followerId || !sharerUsername) {
    throw new Error('Missing user credentials for share/send Playwright test')
  }
  await followUser(follower, sharer)

  sharedPostTitle = `Shared Post ${random}`
  sharedPostSlug = `shared-post-${random}`
  sharedPostId = await insertTestPost({
    title: sharedPostTitle,
    slug: sharedPostSlug,
    createdById: creator.id,
    markdown: 'Shared post body',
  })
  sendPostTitle = `Sent Post ${random}`
  sendPostSlug = `sent-post-${random}`
  sendPostId = await insertTestPost({
    title: sendPostTitle,
    slug: sendPostSlug,
    createdById: creator.id,
    markdown: 'Sent post body',
  })
})

test.describe('Feed Share And Send', () => {
  test('share with followers surfaces in the follower feed with attribution', async ({
    browser,
  }, testInfo) => {
    await withMonitoredPage(browser, testInfo, async sharerPage => {
      await loginAsUser(sharerPage, sharerId)
      await navigateTo(sharerPage, `/discussion/${sharedPostSlug}`)

      await sharerPage.getByTestId('post-detail-overflow-trigger').click()
      await sharerPage.getByTestId('post-detail-share-button').click()
      await expect(sharerPage.locator('[data-sonner-toast][data-type="success"]')).toContainText(
        'Share queued',
      )
    })
    await processLatestPostDistribution('post_share', sharedPostId)

    await expect
      .poll(async () => {
        const { rows } = await read(
          `/* share-send-spec post feed share */
          SELECT COUNT(*)::INT AS count
          FROM post_feed_shares
          WHERE recipient_user_id = $1
            AND shared_by_user_id = $2
            AND post_id = $3
        `,
          [followerId, sharerId, sharedPostId],
        )
        return rows[0]?.count ?? 0
      })
      .toBeGreaterThan(0)

    await withMonitoredPage(browser, testInfo, async followerPage => {
      await loginAsUser(followerPage, followerId)
      await navigateTo(followerPage, '/feed/posts/friends')

      await expect(followerPage.getByTestId('shared-byline-label').first()).toBeVisible()
      await expect(
        followerPage
          .getByTestId('shared-byline-user-link')
          .filter({ hasText: `@${sharerUsername}` }),
      ).toBeVisible()

      // Cover follower-share-more-actions-button / follower-share-menu-* on post-card surfaces
      await followerPage.getByTestId('follower-share-more-actions-button').first().click()
      await expect(followerPage.getByTestId('follower-share-menu-share').first()).toBeVisible()
      await expect(followerPage.getByTestId('follower-share-menu-send').first()).toBeVisible()
      await followerPage.keyboard.press('Escape')
    })
  })

  test('send to followers creates a notification for the follower', async ({
    browser,
  }, testInfo) => {
    await withMonitoredPage(browser, testInfo, async sharerPage => {
      await loginAsUser(sharerPage, sharerId)
      await navigateTo(sharerPage, `/discussion/${sendPostSlug}`)

      await sharerPage.getByTestId('post-detail-overflow-trigger').click()
      await sharerPage.getByTestId('post-detail-send-button').click()
      await expect(sharerPage.getByTestId('follower-send-dialog-title')).toBeVisible()
      await sharerPage.getByTestId('follower-send-dialog-send-button').click()
      await expect(sharerPage.locator('[data-sonner-toast][data-type="success"]')).toContainText(
        'Send queued',
      )
    })
    await processLatestPostDistribution('post_send', sendPostId)

    await expect
      .poll(async () => {
        const { rows } = await read(
          `/* share-send-spec notification */
          SELECT COUNT(*)::INT AS count
          FROM notifications
          WHERE user_id = $1
            AND sent_by_user_id = $2
            AND post_id = $3
            AND delivery_type = 'manual_send'
        `,
          [followerId, sharerId, sendPostId],
        )
        return rows[0]?.count ?? 0
      })
      .toBeGreaterThan(0)
  })
})
