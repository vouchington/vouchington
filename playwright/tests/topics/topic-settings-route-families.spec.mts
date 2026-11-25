import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'
import {
  BANK_ACCOUNT,
  CARD,
  REFERRAL_PROGRAM,
  REWARDS_PROGRAM,
  REWARDS_PROGRAM_STATUS,
  SOURCE,
  TOPIC,
  assertAboutStep,
  assertDomainsStep,
  assertMergeStep,
  seed,
  type Seeded,
} from '../../helpers/topic-settings-route-steps.mts'

async function assertTopicType(page: Page, topicType: string): Promise<void> {
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

async function assertOwnedAlias(page: Page, seeded: Seeded): Promise<void> {
  const input = page.getByTestId('aliases-input')
  await input.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  const alias = `route-alias-${seeded.suffix}`
  await input.pressSequentially(alias)
  await page.getByTestId('add-aliases-submit').click()
  await expect(page.getByTestId(`alias-row-${alias}`)).toBeVisible()
}

test.describe('Typed topic settings route families', () => {
  test.use({ storageState: AUTH_STATE })

  test('bank-account settings redirect keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(BANK_ACCOUNT, 'redirect')
    await navigateTo(page, `/bank-account/${seeded.id}/settings`)
    await assertAboutStep(page, seeded)
  })

  test('bank-account settings about keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(BANK_ACCOUNT, 'about')
    await navigateTo(page, `/bank-account/${seeded.id}/settings/about`)
    await assertAboutStep(page, seeded)
  })

  test('bank-account settings behavior keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(BANK_ACCOUNT, 'behavior')
    await navigateTo(page, `/bank-account/${seeded.id}/settings/behavior`)
    await assertTopicType(page, BANK_ACCOUNT.topicType)
  })

  test('bank-account settings aliases keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(BANK_ACCOUNT, 'aliases')
    await navigateTo(page, `/bank-account/${seeded.id}/settings/aliases`)
    await assertOwnedAlias(page, seeded)
  })

  test('bank-account settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(BANK_ACCOUNT, 'domains')
    await navigateTo(page, `/bank-account/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('bank-account settings merge keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(BANK_ACCOUNT, 'merge')
    await navigateTo(page, `/bank-account/${seeded.id}/settings/merge`)
    await assertMergeStep(page, seeded)
  })

  test('card settings redirect keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(CARD, 'redirect')
    await navigateTo(page, `/card/${seeded.id}/settings`)
    await assertAboutStep(page, seeded)
  })

  test('card settings about keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(CARD, 'about')
    await navigateTo(page, `/card/${seeded.id}/settings/about`)
    await assertAboutStep(page, seeded)
  })

  test('card settings behavior keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(CARD, 'behavior')
    await navigateTo(page, `/card/${seeded.id}/settings/behavior`)
    await assertTopicType(page, CARD.topicType)
  })

  test('card settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(CARD, 'domains')
    await navigateTo(page, `/card/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('rewards-program settings redirect keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM, 'redirect')
    await navigateTo(page, `/rewards-program/${seeded.id}/settings`)
    await assertAboutStep(page, seeded)
  })

  test('rewards-program settings about keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM, 'about')
    await navigateTo(page, `/rewards-program/${seeded.id}/settings/about`)
    await assertAboutStep(page, seeded)
  })

  test('rewards-program settings behavior keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM, 'behavior')
    await navigateTo(page, `/rewards-program/${seeded.id}/settings/behavior`)
    await assertTopicType(page, REWARDS_PROGRAM.topicType)
  })

  test('rewards-program settings aliases keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM, 'aliases')
    await navigateTo(page, `/rewards-program/${seeded.id}/settings/aliases`)
    await assertOwnedAlias(page, seeded)
  })

  test('rewards-program settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM, 'domains')
    await navigateTo(page, `/rewards-program/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('rewards-program settings merge keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM, 'merge')
    await navigateTo(page, `/rewards-program/${seeded.id}/settings/merge`)
    await assertMergeStep(page, seeded)
  })

  test('rewards-program-status settings redirect keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM_STATUS, 'redirect')
    await navigateTo(page, `/rewards-program-status/${seeded.id}/settings`)
    await assertAboutStep(page, seeded)
  })

  test('rewards-program-status settings about keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM_STATUS, 'about')
    await navigateTo(page, `/rewards-program-status/${seeded.id}/settings/about`)
    await assertAboutStep(page, seeded)
  })

  test('rewards-program-status settings behavior keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM_STATUS, 'behavior')
    await navigateTo(page, `/rewards-program-status/${seeded.id}/settings/behavior`)
    await assertTopicType(page, REWARDS_PROGRAM_STATUS.topicType)
  })

  test('rewards-program-status settings aliases keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM_STATUS, 'aliases')
    await navigateTo(page, `/rewards-program-status/${seeded.id}/settings/aliases`)
    await assertOwnedAlias(page, seeded)
  })

  test('rewards-program-status settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM_STATUS, 'domains')
    await navigateTo(page, `/rewards-program-status/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('rewards-program-status settings merge keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REWARDS_PROGRAM_STATUS, 'merge')
    await navigateTo(page, `/rewards-program-status/${seeded.id}/settings/merge`)
    await assertMergeStep(page, seeded)
  })

  test('referral-program settings redirect keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REFERRAL_PROGRAM, 'redirect')
    await navigateTo(page, `/referral-program/${seeded.id}/settings`)
    await assertAboutStep(page, seeded)
  })

  test('referral-program settings about keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REFERRAL_PROGRAM, 'about')
    await navigateTo(page, `/referral-program/${seeded.id}/settings/about`)
    await assertAboutStep(page, seeded)
  })

  test('referral-program settings behavior keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REFERRAL_PROGRAM, 'behavior')
    await navigateTo(page, `/referral-program/${seeded.id}/settings/behavior`)
    await assertTopicType(page, REFERRAL_PROGRAM.topicType)
  })

  test('referral-program settings aliases keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REFERRAL_PROGRAM, 'aliases')
    await navigateTo(page, `/referral-program/${seeded.id}/settings/aliases`)
    await assertOwnedAlias(page, seeded)
  })

  test('referral-program settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REFERRAL_PROGRAM, 'domains')
    await navigateTo(page, `/referral-program/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('referral-program settings merge keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(REFERRAL_PROGRAM, 'merge')
    await navigateTo(page, `/referral-program/${seeded.id}/settings/merge`)
    await assertMergeStep(page, seeded)
  })

  test('topic settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(TOPIC, 'domains')
    await navigateTo(page, `/topic/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('source settings redirect keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(SOURCE, 'redirect')
    await navigateTo(page, `/source/${seeded.id}/settings`)
    await assertAboutStep(page, seeded)
  })

  test('source settings about keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(SOURCE, 'about')
    await navigateTo(page, `/source/${seeded.id}/settings/about`)
    await assertAboutStep(page, seeded)
  })

  test('source settings aliases keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(SOURCE, 'aliases')
    await navigateTo(page, `/source/${seeded.id}/settings/aliases`)
    await assertOwnedAlias(page, seeded)
  })

  test('source settings domains keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(SOURCE, 'domains')
    await navigateTo(page, `/source/${seeded.id}/settings/domains`)
    await assertDomainsStep(page, seeded)
  })

  test('source settings merge keeps the owned topic ready', async ({ page }) => {
    const seeded = await seed(SOURCE, 'merge')
    await navigateTo(page, `/source/${seeded.id}/settings/merge`)
    await assertMergeStep(page, seeded)
  })
})
