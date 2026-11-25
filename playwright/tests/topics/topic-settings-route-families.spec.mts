import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, randomSuffix, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'

type SettingsFamily = { route: string; topicType: string }

const BANK_ACCOUNT = { route: 'bank-account', topicType: 'bank_account' }
const CARD = { route: 'card', topicType: 'card' }
const REWARDS_PROGRAM = { route: 'rewards-program', topicType: 'rewards_program' }
const REWARDS_PROGRAM_STATUS = {
  route: 'rewards-program-status',
  topicType: 'rewards_program_status',
}
const REFERRAL_PROGRAM = { route: 'referral-program', topicType: 'referral_program' }
const TOPIC = { route: 'topic', topicType: 'topic' }
const SOURCE = { route: 'source', topicType: 'rss_feed' }

// Each step seeds its own topic and loads one settings document. A
// server-rendered document can take 6-12s on a loaded CI shard, so a test that
// walks every settings route in sequence exceeds the 30s test budget (#6314).
async function seed(family: SettingsFamily, step: string) {
  const suffix = randomSuffix()
  const name = `Settings ${family.topicType} ${step} ${suffix}`
  const { id } = await insertTestTopic(
    name,
    `settings-${family.route}-${step}-${suffix}`,
    family.topicType,
  )
  return { suffix, name, id, base: `/${family.route}/${id}/settings` }
}

async function assertAboutStep(page: Page, family: SettingsFamily): Promise<void> {
  const { name, base } = await seed(family, 'about')
  await navigateTo(page, base)
  await expect(page).toHaveURL(/\/settings\/about$/)
  await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(name)
}

async function assertBehaviorStep(page: Page, family: SettingsFamily): Promise<void> {
  const { base } = await seed(family, 'behavior')
  await navigateTo(page, `${base}/behavior`)
  await expectTopicType(page, family.topicType)
}

async function assertAliasesStep(page: Page, family: SettingsFamily): Promise<void> {
  const { suffix, base } = await seed(family, 'aliases')
  await navigateTo(page, `${base}/aliases`)
  await addOwnedAlias(page, `route-alias-${suffix}`)
}

async function assertDomainsStep(page: Page, family: SettingsFamily): Promise<void> {
  const { suffix, name, id, base } = await seed(family, 'domains')
  await navigateTo(page, `${base}/domains`)
  await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
  await persistOwnedDomain(page, id, suffix)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
}

async function assertMergeStep(page: Page, family: SettingsFamily): Promise<void> {
  const { suffix, name, base } = await seed(family, 'merge')
  await navigateTo(page, `${base}/merge`)
  await expect(page.getByTestId('topic-settings-merge')).toContainText(name)
  await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
  await selectOwnedMergeDestination(page, suffix, name)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
}

async function expectTopicType(page: Page, topicType: string): Promise<void> {
  await expect(page.getByTestId('topic-type-section-save-topic-type')).toBeVisible()
  if (topicType === 'card') {
    await expect(page.getByTestId('type-attributes-section-submit')).toBeVisible()
  }
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
  const hostname = `owned-domain-${suffix}.voucha.ai`
  await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
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

test.describe('Typed topic settings route families', () => {
  test.use({ storageState: AUTH_STATE })

  test('bank-account settings about preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAboutStep(page, BANK_ACCOUNT)
  })

  test('bank-account settings behavior preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertBehaviorStep(page, BANK_ACCOUNT)
  })

  test('bank-account settings aliases preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAliasesStep(page, BANK_ACCOUNT)
  })

  test('bank-account settings domains preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertDomainsStep(page, BANK_ACCOUNT)
  })

  test('bank-account settings merge preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertMergeStep(page, BANK_ACCOUNT)
  })

  test('card settings about preserves the owned topic and form readiness', async ({ page }) => {
    await assertAboutStep(page, CARD)
  })

  test('card settings behavior preserves the owned topic and form readiness', async ({ page }) => {
    await assertBehaviorStep(page, CARD)
  })

  test('card settings domains preserves the owned topic and form readiness', async ({ page }) => {
    await assertDomainsStep(page, CARD)
  })

  test('rewards-program settings about preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAboutStep(page, REWARDS_PROGRAM)
  })

  test('rewards-program settings behavior preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertBehaviorStep(page, REWARDS_PROGRAM)
  })

  test('rewards-program settings aliases preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAliasesStep(page, REWARDS_PROGRAM)
  })

  test('rewards-program settings domains preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertDomainsStep(page, REWARDS_PROGRAM)
  })

  test('rewards-program settings merge preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertMergeStep(page, REWARDS_PROGRAM)
  })

  test('rewards-program-status settings about preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAboutStep(page, REWARDS_PROGRAM_STATUS)
  })

  test('rewards-program-status settings behavior preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertBehaviorStep(page, REWARDS_PROGRAM_STATUS)
  })

  test('rewards-program-status settings aliases preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAliasesStep(page, REWARDS_PROGRAM_STATUS)
  })

  test('rewards-program-status settings domains preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertDomainsStep(page, REWARDS_PROGRAM_STATUS)
  })

  test('rewards-program-status settings merge preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertMergeStep(page, REWARDS_PROGRAM_STATUS)
  })

  test('referral-program settings about preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAboutStep(page, REFERRAL_PROGRAM)
  })

  test('referral-program settings behavior preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertBehaviorStep(page, REFERRAL_PROGRAM)
  })

  test('referral-program settings aliases preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertAliasesStep(page, REFERRAL_PROGRAM)
  })

  test('referral-program settings domains preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertDomainsStep(page, REFERRAL_PROGRAM)
  })

  test('referral-program settings merge preserves the owned topic and form readiness', async ({
    page,
  }) => {
    await assertMergeStep(page, REFERRAL_PROGRAM)
  })

  test('topic settings domains preserves the owned topic and form readiness', async ({ page }) => {
    await assertDomainsStep(page, TOPIC)
  })

  test('source settings about preserves the owned topic and form readiness', async ({ page }) => {
    await assertAboutStep(page, SOURCE)
  })

  test('source settings aliases preserves the owned topic and form readiness', async ({ page }) => {
    await assertAliasesStep(page, SOURCE)
  })

  test('source settings domains preserves the owned topic and form readiness', async ({ page }) => {
    await assertDomainsStep(page, SOURCE)
  })

  test('source settings merge preserves the owned topic and form readiness', async ({ page }) => {
    await assertMergeStep(page, SOURCE)
  })
})
