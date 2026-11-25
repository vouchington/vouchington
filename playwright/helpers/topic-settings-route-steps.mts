import { expect, type Page } from './test.mts'
import { randomSuffix, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'
import { insertTestTopic } from './insert-test-topic.mts'

export type SettingsFamily = { route: string; topicType: string }

export const BANK_ACCOUNT = { route: 'bank-account', topicType: 'bank_account' }
export const CARD = { route: 'card', topicType: 'card' }
export const REWARDS_PROGRAM = { route: 'rewards-program', topicType: 'rewards_program' }
export const REWARDS_PROGRAM_STATUS = {
  route: 'rewards-program-status',
  topicType: 'rewards_program_status',
}
export const REFERRAL_PROGRAM = { route: 'referral-program', topicType: 'referral_program' }
export const TOPIC = { route: 'topic', topicType: 'topic' }
export const SOURCE = { route: 'source', topicType: 'rss_feed' }

// Each step seeds its own topic and loads one settings document. A
// server-rendered document can take 6-12s on a loaded CI shard, so a test that
// walks every settings route in sequence exceeds the 30s test budget (#6314).
export async function seed(family: SettingsFamily, step: string) {
  const suffix = randomSuffix()
  const name = `Settings ${family.topicType} ${step} ${suffix}`
  const { id } = await insertTestTopic(
    name,
    `settings-${family.route}-${step}-${suffix}`,
    family.topicType,
  )
  return { suffix, name, id }
}

export type Seeded = Awaited<ReturnType<typeof seed>>

export async function assertAboutStep(page: Page, seeded: Seeded): Promise<void> {
  await expect(page).toHaveURL(/\/settings\/about$/)
  await expect(page.getByTestId('topic-edit-name-input')).toHaveValue(seeded.name)
}

export async function assertDomainsStep(page: Page, seeded: Seeded): Promise<void> {
  await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
  await persistOwnedDomain(page, seeded.id, seeded.suffix)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(seeded.name)
}

export async function assertMergeStep(page: Page, seeded: Seeded): Promise<void> {
  await expect(page.getByTestId('topic-settings-merge')).toContainText(seeded.name)
  await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
  await selectOwnedMergeDestination(page, seeded.suffix, seeded.name)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(seeded.name)
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
