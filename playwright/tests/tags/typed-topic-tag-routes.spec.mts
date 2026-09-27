import { expect, test, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Typed topic tag management', () => {
  test.use({ storageState: AUTH_STATE })

  test('bank-account tags search and attach a genuine related topic', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Tag owner bank-account ${suffix}`
    const owner = await insertTestTopic(name, `tag-owner-bank-account-${suffix}`, 'bank_account')
    const targetName = `Related target ${suffix}`
    await insertTestTopic(targetName, `related-target-${suffix}`, 'topic')
    await navigateTo(page, `/bank-account/${owner.id}/tags/topic`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await attachRelatedTopic(page, targetName)
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('rewards-program tags search and attach a genuine related topic', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Tag owner rewards-program ${suffix}`
    const owner = await insertTestTopic(
      name,
      `tag-owner-rewards-program-${suffix}`,
      'rewards_program',
    )
    const targetName = `Related target ${suffix}`
    await insertTestTopic(targetName, `related-target-${suffix}`, 'topic')
    await navigateTo(page, `/rewards-program/${owner.id}/tags/topic`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await attachRelatedTopic(page, targetName)
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('rewards-program-status tags search and attach a genuine related topic', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Tag owner rewards-program-status ${suffix}`
    const owner = await insertTestTopic(
      name,
      `tag-owner-rewards-program-status-${suffix}`,
      'rewards_program_status',
    )
    const targetName = `Related target ${suffix}`
    await insertTestTopic(targetName, `related-target-${suffix}`, 'topic')
    await navigateTo(page, `/rewards-program-status/${owner.id}/tags/topic`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await attachRelatedTopic(page, targetName)
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('referral-program tags search and attach a genuine related topic', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Tag owner referral-program ${suffix}`
    const owner = await insertTestTopic(
      name,
      `tag-owner-referral-program-${suffix}`,
      'referral_program',
    )
    const targetName = `Related target ${suffix}`
    await insertTestTopic(targetName, `related-target-${suffix}`, 'topic')
    await navigateTo(page, `/referral-program/${owner.id}/tags/topic`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await attachRelatedTopic(page, targetName)
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('topic tags search and attach a genuine related topic', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Tag owner topic ${suffix}`
    const owner = await insertTestTopic(name, `tag-owner-topic-${suffix}`, 'topic')
    const targetName = `Related target ${suffix}`
    await insertTestTopic(targetName, `related-target-${suffix}`, 'topic')
    await navigateTo(page, `/topic/${owner.id}/tags/topic`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await attachRelatedTopic(page, targetName)
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })
})

async function attachRelatedTopic(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Related Topics')
  await expect(
    page.getByTestId('manage-tags-current-section').getByTestId('tag-list-empty'),
  ).toBeVisible()
  await page.getByTestId('tag-autocomplete-input-topic').pressSequentially(name)
  await page.getByTestId('tag-autocomplete-item-topic').filter({ hasText: name }).click()
}
