import { expect, protectPlaywrightHookTimeouts, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertTestTopic as insertTestSourceTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { insertTestTopic } from '../../../backend/test-helpers/entities/topics.mts'
import { setTopicHostnameLink } from '../../../backend/services/topics/hostname-link.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

const SEEDED_DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'

let topicId: string
let feedHostname: string
let feedUrlId: string

test.beforeAll(async () => {
  protectPlaywrightHookTimeouts(test.info())
  const suffix = randomSuffix()
  topicId = await insertTestTopic({
    name: `PW Foundation Topic ${suffix}`,
    slug: `pw-foundation-topic-${suffix}`,
    createdById: TEST_USER_ID,
  })
  const sourceTopic = await insertTestSourceTopic(
    `PW Foundation Source ${suffix}`,
    `pw-foundation-source-${suffix}`,
    'rss_feed',
  )
  const feed = await insertTestRssFeed(sourceTopic.id, `pw-foundation-${suffix}`)
  await setTopicHostnameLink(sourceTopic.id, feed.hostnameId)
  feedHostname = feed.hostname
  feedUrlId = feed.rssFeedUrlId
})

test.describe('Signed-out foundation test ids', () => {
  test('home page exposes the get started call to action', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByTestId('home-page-cta-get-started')).toBeVisible()
  })

  test('videos page exposes the PeerTube search action', async ({ page }) => {
    await setFeatureFlags(page, { fediverse: true })
    await navigateTo(page, '/videos')
    await expect(page.getByTestId('videos-search-peertube')).toBeVisible()
  })

  test('referral visitors see the sign up aside on topic pages', async ({ page }) => {
    await navigateTo(page, `/topic/${topicId}/posts?referrer=tests`)
    await expect(page.getByTestId('referral-cta-aside-link').first()).toBeAttached()
    await expect(page.getByTestId('referral-cta-aside-dismiss').first()).toBeAttached()
  })

  test('domain overview exposes the source and url links', async ({ page }) => {
    await navigateTo(page, `/domain/${feedHostname}`)
    await expect(page.getByTestId('domain-rss-feed-url').first()).toBeAttached()
    await expect(page.getByTestId('domain-url-link').first()).toBeAttached()
  })
})

test.describe('Signed-in foundation test ids', () => {
  test.use({ storageState: AUTH_STATE })

  test('url detail exposes the source link', async ({ page }) => {
    await navigateTo(page, `/url/${feedUrlId}`)
    await expect(page.getByTestId('url-page-source-link')).toBeAttached()
  })

  test('post detail asides invite readers to contribute', async ({ page }) => {
    await navigateTo(page, `/discussion/${SEEDED_DISCUSSION_ID}`)
    await expect(page.getByTestId('contribute-cta-aside-item').first()).toBeAttached()
  })

  test('subscribe stays disabled while the bookmark state loads', async ({ page }) => {
    await page.route('**/api/v1/bookmarks/user/**', () => undefined)
    await navigateTo(page, '/user/test-friend', { waitUntil: 'load' })
    await expect(page.getByTestId('entity-bookmark-button-disabled').first()).toBeAttached()
  })
})
