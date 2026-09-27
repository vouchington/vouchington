import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Typed topic settings route families', () => {
  test.use({ storageState: AUTH_STATE })

  test('bank-account settings preserve the owned topic and form readiness', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Settings bank_account ${suffix}`
    const { id } = await insertTestTopic(name, `settings-bank-account-${suffix}`, 'bank_account')
    await navigateTo(page, `/bank-account/${id}/settings`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await expect(page).toHaveURL(/\/settings\/about$/)
    await navigateTo(page, `/bank-account/${id}/settings/about`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await navigateTo(page, `/bank-account/${id}/settings/behavior`)
    await expectTopicType(page, 'bank_account')
    await navigateTo(page, `/bank-account/${id}/settings/aliases`)
    await addOwnedAlias(page, `route-alias-${suffix}`)
    await navigateTo(page, `/bank-account/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await navigateTo(page, `/bank-account/${id}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toContainText(name)
    await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
    await selectOwnedMergeDestination(page, suffix, name)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('card settings preserve the owned topic and form readiness', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Settings card ${suffix}`
    const { id } = await insertTestTopic(name, `settings-card-${suffix}`, 'card')
    await navigateTo(page, `/card/${id}/settings`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await expect(page).toHaveURL(/\/settings\/about$/)
    await navigateTo(page, `/card/${id}/settings/about`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await navigateTo(page, `/card/${id}/settings/behavior`)
    await expectTopicType(page, 'card')
    await navigateTo(page, `/card/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('rewards-program settings preserve the owned topic and form readiness', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Settings rewards_program ${suffix}`
    const { id } = await insertTestTopic(
      name,
      `settings-rewards-program-${suffix}`,
      'rewards_program',
    )
    await navigateTo(page, `/rewards-program/${id}/settings`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await expect(page).toHaveURL(/\/settings\/about$/)
    await navigateTo(page, `/rewards-program/${id}/settings/about`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await navigateTo(page, `/rewards-program/${id}/settings/behavior`)
    await expectTopicType(page, 'rewards_program')
    await navigateTo(page, `/rewards-program/${id}/settings/aliases`)
    await addOwnedAlias(page, `route-alias-${suffix}`)
    await navigateTo(page, `/rewards-program/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await navigateTo(page, `/rewards-program/${id}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toContainText(name)
    await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
    await selectOwnedMergeDestination(page, suffix, name)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('rewards-program-status settings preserve the owned topic and form readiness', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Settings rewards_program_status ${suffix}`
    const { id } = await insertTestTopic(
      name,
      `settings-rewards-program-status-${suffix}`,
      'rewards_program_status',
    )
    await navigateTo(page, `/rewards-program-status/${id}/settings`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await expect(page).toHaveURL(/\/settings\/about$/)
    await navigateTo(page, `/rewards-program-status/${id}/settings/about`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await navigateTo(page, `/rewards-program-status/${id}/settings/behavior`)
    await expectTopicType(page, 'rewards_program_status')
    await navigateTo(page, `/rewards-program-status/${id}/settings/aliases`)
    await addOwnedAlias(page, `route-alias-${suffix}`)
    await navigateTo(page, `/rewards-program-status/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await navigateTo(page, `/rewards-program-status/${id}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toContainText(name)
    await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
    await selectOwnedMergeDestination(page, suffix, name)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('referral-program settings preserve the owned topic and form readiness', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Settings referral_program ${suffix}`
    const { id } = await insertTestTopic(
      name,
      `settings-referral-program-${suffix}`,
      'referral_program',
    )
    await navigateTo(page, `/referral-program/${id}/settings`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await expect(page).toHaveURL(/\/settings\/about$/)
    await navigateTo(page, `/referral-program/${id}/settings/about`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await navigateTo(page, `/referral-program/${id}/settings/behavior`)
    await expectTopicType(page, 'referral_program')
    await navigateTo(page, `/referral-program/${id}/settings/aliases`)
    await addOwnedAlias(page, `route-alias-${suffix}`)
    await navigateTo(page, `/referral-program/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await navigateTo(page, `/referral-program/${id}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toContainText(name)
    await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
    await selectOwnedMergeDestination(page, suffix, name)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('topic settings preserve the owned topic and form readiness', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Settings topic ${suffix}`
    const { id } = await insertTestTopic(name, `settings-topic-${suffix}`, 'topic')
    await navigateTo(page, `/topic/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('source settings preserve the owned topic and form readiness', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Settings rss_feed ${suffix}`
    const { id } = await insertTestTopic(name, `settings-rss-feed-${suffix}`, 'rss_feed')
    await navigateTo(page, `/source/${id}/settings`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await expect(page).toHaveURL(/\/settings\/about$/)
    await navigateTo(page, `/source/${id}/settings/about`)
    await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
    await navigateTo(page, `/source/${id}/settings/aliases`)
    await addOwnedAlias(page, `route-alias-${suffix}`)
    await navigateTo(page, `/source/${id}/settings/domains`)
    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await persistOwnedDomain(page, id, suffix)
    await navigateTo(page, `/source/${id}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toContainText(name)
    await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
    await selectOwnedMergeDestination(page, suffix, name)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })
})

async function expectTopicType(page: Page, topicType: string): Promise<void> {
  const trigger = page.getByTestId('topic-type-trigger')
  await trigger.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await trigger.click()
  await expect(page.getByTestId(`topic-type-option-${topicType}`)).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('topic-noindex')).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('topic-allow-reviews')).toHaveAttribute('aria-checked', 'true')
}

async function addOwnedAlias(page: Page, alias: string): Promise<void> {
  const input = page.getByTestId('aliases-input')
  await input.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await input.pressSequentially(alias)
  await page.getByTestId('add-aliases-submit').click()
  await expect(page.getByTestId(`alias-row-${alias}`)).toBeVisible()
}

async function persistOwnedDomain(page: Page, id: string, suffix: string): Promise<void> {
  const hostname = `owned-domain-${suffix}.example.com`
  const input = page.getByTestId('primary-domain-input')
  await input.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await expect(input).toHaveValue('')
  await input.pressSequentially(hostname)
  const saved = page.waitForResponse(
    response =>
      response.url().includes(`/api/v1/topics/${id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok(),
  )
  await page.getByTestId('primary-domain-save').click()
  await saved
  await page.reload()
  await expect(input).toHaveValue(hostname)
}

async function selectOwnedMergeDestination(
  page: Page,
  suffix: string,
  sourceName: string,
): Promise<void> {
  const name = `Merge destination ${suffix}`
  await insertTestTopic(name, `merge-destination-${suffix}`, 'topic')
  const search = page.getByTestId('topic-autocomplete-input')
  await search.pressSequentially(name)
  await page.getByTestId('topic-autocomplete-item').filter({ hasText: name }).click()
  const confirmation = page.getByTestId('merge-topic-confirmation-input')
  await confirmation.pressSequentially(sourceName)
  await expect(confirmation).toHaveValue(sourceName)
  await expect(page.getByTestId('merge-topic-submit')).toBeEnabled()
  await confirmation.press('ControlOrMeta+A')
  await confirmation.pressSequentially('wrong confirmation')
  await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
}
