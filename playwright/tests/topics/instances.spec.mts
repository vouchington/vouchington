import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { linkTopicHostname } from '../../helpers/link-topic-hostname.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestFediverseInstanceMetadata } from '../../helpers/insert-test-fediverse-instance.mts'

test.describe('Fediverse Instances Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('filters the dedicated directory and renders classification, trust, and actions', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const hostname = `mastodon-${suffix}.example`
    const { id: topicId } = await insertTestTopic(
      hostname,
      `instance-${suffix}`,
      'fediverse_instance',
    )
    const hostnameId = await linkTopicHostname(topicId, hostname)
    await insertTestFediverseInstanceMetadata(topicId, hostnameId, {
      software: 'mastodon',
      protocol: 'activitypub',
      version: '4.4.0',
      totalUsers: 1200,
      monthlyActiveUsers: 340,
      openRegistrations: true,
    })

    await setFeatureFlags(page, { fediverse: true })
    await navigateTo(page, `/instances?q=${encodeURIComponent(hostname)}&sort=new`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Fediverse Instances')

    const item = page.getByTestId('topic-card').filter({ hasText: hostname })
    await expect(item).toBeVisible()
    await expect(item.getByTestId('fediverse-instance-card-metadata')).toContainText(
      'mastodon 4.4.0',
    )
    await expect(item.getByTestId('fediverse-instance-card-metadata')).toContainText('Trusted')
    await expect(item.getByTestId('follow-button')).toBeVisible()
    await expect(item.getByTestId('entity-bookmark-button')).toBeVisible()
  })
})
