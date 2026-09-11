import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { linkTopicHostname } from '../../helpers/link-topic-hostname.mts'
import { insertTestReferralProgram } from '../../helpers/insert-test-referral-program.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'
import { insertTestFediverseInstanceMetadata } from '../../helpers/insert-test-fediverse-instance.mts'

test.describe('Instance Detail Routes', () => {
  test.use({ storageState: AUTH_STATE })

  let topicId: string
  let topicSlug: string
  let referralTopicId: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const hostname = `pw-instance-${suffix}.example`
    topicSlug = `instance-detail-${suffix}`
    const topic = await insertTestTopic(hostname, topicSlug, 'fediverse_instance')
    topicId = topic.id
    const hostnameId = await linkTopicHostname(topicId, hostname)
    await insertTestFediverseInstanceMetadata(topicId, hostnameId, {
      software: 'mastodon',
      protocol: 'activitypub',
      version: '4.4.0',
      totalUsers: 1200,
      monthlyActiveUsers: 340,
      openRegistrations: true,
    })

    // Separate topic so setting referral_program_id doesn't change the base
    // route's default-subpage redirect target for the topic above.
    const referralSuffix = randomSuffix()
    const referralHostname = `pw-instance-ref-${referralSuffix}.example`
    const referralTopic = await insertTestTopic(
      referralHostname,
      `instance-detail-ref-${referralSuffix}`,
      'fediverse_instance',
    )
    referralTopicId = referralTopic.id
    await linkTopicHostname(referralTopicId, referralHostname)
    const { referralProgramTopicId } = await insertTestReferralProgram(referralSuffix)
    await write('UPDATE topics SET referral_program_id = $1 WHERE id = $2', [
      referralProgramTopicId,
      referralTopicId,
    ])
  })

  test.beforeEach(async ({ page }) => {
    await setFeatureFlags(page, { fediverse: true })
  })

  test('base route redirects to posts', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}`)
    await expect(page).toHaveURL(/\/instance\/[^/]+\/posts$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('slug detail renders public instance metadata and generic actions', async ({ page }) => {
    await navigateTo(page, `/instance/${topicSlug}/posts`)

    const metadata = page.getByTestId('fediverse-instance-metadata')
    await expect(metadata).toContainText('mastodon 4.4.0')
    await expect(metadata).toContainText('activitypub')
    await expect(metadata).toContainText('1,200')
    await expect(metadata).toContainText('340')
    await expect(metadata).toContainText('Open')
    await expect(metadata).toContainText('Trusted')
    await expect(page.getByTestId('follow-button')).toBeVisible()
    await expect(page.getByTestId('entity-bookmark-button')).toBeVisible()
  })

  test('posts tab renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/posts`)
    await expect(page).toHaveURL(`/instance/${topicId}/posts`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('reviews tab renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/reviews`)
    await expect(page).toHaveURL(`/instance/${topicId}/reviews`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('data-points tab renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/data-points`)
    await expect(page).toHaveURL(`/instance/${topicId}/data-points`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('discussions redirects to posts', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/discussions`)
    await expect(page).toHaveURL(/\/instance\/[^/]+\/posts$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('latest tab renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/latest`)
    await expect(page).toHaveURL(`/instance/${topicId}/latest`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('news tab renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/news`)
    await expect(page).toHaveURL(`/instance/${topicId}/news`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('topic tags tab renders related topics', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/tags/topic`)
    await expect(page).toHaveURL(`/instance/${topicId}/tags/topic`)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Related Topics')
  })

  test('referral-links tab renders for a referral-linked instance', async ({ page }) => {
    await navigateTo(page, `/instance/${referralTopicId}/referral-links`)
    await expect(page).toHaveURL(`/instance/${referralTopicId}/referral-links`)
    await expect(page.getByTestId('referral-links-page-heading')).toBeVisible()
  })

  test('settings redirects to settings/about', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/settings`)
    await expect(page).toHaveURL(/\/instance\/[^/]+\/settings\/about$/)
  })

  test('settings/about renders basic info', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/settings/about`)
    await expect(page).toHaveURL(`/instance/${topicId}/settings/about`)
    await expect(page.getByTestId('topic-settings-about')).toBeVisible()
    await expect(page.getByTestId('basic-info-heading')).toBeVisible()
  })

  test('settings/aliases renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/settings/aliases`)
    await expect(page).toHaveURL(`/instance/${topicId}/settings/aliases`)
    await expect(page.getByTestId('current-aliases-heading')).toContainText('Current Aliases')
    await expect(page.getByTestId('add-aliases-heading')).toBeVisible()
  })

  test('settings/behavior renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/settings/behavior`)
    await expect(page).toHaveURL(`/instance/${topicId}/settings/behavior`)
    await expect(page.getByTestId('topic-settings-behavior')).toBeVisible()
    await expect(page.getByTestId('topic-type-heading')).toBeVisible()
    await expect(page.getByTestId('spending-category-heading')).toBeVisible()
  })

  test('settings/domains renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/settings/domains`)
    await expect(page).toHaveURL(`/instance/${topicId}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await expect(page.getByTestId('domains-heading')).toBeVisible()
    await expect(page.getByTestId('primary-domain-heading')).toBeVisible()
    await expect(page.getByTestId('additional-domains-heading')).toBeVisible()
  })

  test('settings/merge renders', async ({ page }) => {
    await navigateTo(page, `/instance/${topicId}/settings/merge`)
    await expect(page).toHaveURL(`/instance/${topicId}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toBeVisible()
    await expect(page.getByTestId('merge-topic-confirmation-input')).toBeVisible()
  })

  test('settings/source 404s for a non-rss_feed topic', async ({ page }) => {
    const response = await page.goto(`/instance/${topicId}/settings/source`)
    expect(response?.status()).toBe(404)
  })
})
