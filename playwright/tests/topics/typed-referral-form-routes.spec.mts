import { expect, test, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestEmptyReferralProgram } from '../../helpers/insert-test-referral-program.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { createTestUser } from '../../../backend/test-helpers/entities/users.mts'
import { getTopicByAny } from '../../../backend/services/topics/get.mts'
import { updateTopic } from '../../../backend/services/topics/update.mts'

test.describe('Linked typed topic referral forms', () => {
  test.use({ storageState: AUTH_STATE })

  test('bank-account exposes the linked program and hydrated official-link form', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Referral owner bank-account ${suffix}`
    const owner = await insertTestTopic(
      name,
      `referral-owner-bank-account-${suffix}`,
      'bank_account',
    )
    await linkProgram(owner.id, suffix)
    await navigateTo(page, `/bank-account/${owner.id}/referral-links`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await prepareOfficialLink(page, suffix)
    await expect(page.getByTestId('official-referral-link-submit')).toBeEnabled()
  })

  test('rewards-program exposes the linked program and hydrated official-link form', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Referral owner rewards-program ${suffix}`
    const owner = await insertTestTopic(
      name,
      `referral-owner-rewards-program-${suffix}`,
      'rewards_program',
    )
    await linkProgram(owner.id, suffix)
    await navigateTo(page, `/rewards-program/${owner.id}/referral-links`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await prepareOfficialLink(page, suffix)
    await expect(page.getByTestId('official-referral-link-submit')).toBeEnabled()
  })

  test('rewards-program-status exposes the linked program and hydrated official-link form', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Referral owner rewards-program-status ${suffix}`
    const owner = await insertTestTopic(
      name,
      `referral-owner-rewards-program-status-${suffix}`,
      'rewards_program_status',
    )
    await linkProgram(owner.id, suffix)
    await navigateTo(page, `/rewards-program-status/${owner.id}/referral-links`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await prepareOfficialLink(page, suffix)
    await expect(page.getByTestId('official-referral-link-submit')).toBeEnabled()
  })

  test('source exposes the linked program and hydrated official-link form', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Referral owner source ${suffix}`
    const owner = await insertTestTopic(name, `referral-owner-source-${suffix}`, 'rss_feed')
    await linkProgram(owner.id, suffix)
    await navigateTo(page, `/source/${owner.id}/referral-links`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await prepareOfficialLink(page, suffix)
    await expect(page.getByTestId('official-referral-link-submit')).toBeEnabled()
  })

  test('topic exposes the linked program and hydrated official-link form', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Referral owner topic ${suffix}`
    const owner = await insertTestTopic(name, `referral-owner-topic-${suffix}`, 'topic')
    await linkProgram(owner.id, suffix)
    await navigateTo(page, `/topic/${owner.id}/referral-links`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await prepareOfficialLink(page, suffix)
    await expect(page.getByTestId('official-referral-link-submit')).toBeEnabled()
  })
})

async function linkProgram(topicId: string, suffix: string): Promise<void> {
  const program = await insertTestEmptyReferralProgram(suffix)
  const admin = requireTestValue(
    await createTestUser({ administrator: true }),
    'Fixture administrator missing',
  )
  const topic = requireTestValue(await getTopicByAny(topicId), 'Fixture topic missing')
  await updateTopic(admin, topic, { referral_program_id: program.topicId })
}

async function prepareOfficialLink(page: Page, suffix: string): Promise<void> {
  await expect(page.getByTestId('official-referral-link-form')).toBeVisible()
  await expect(page.getByTestId('official-referral-link-submit')).toBeDisabled()
  await page
    .getByTestId('official-referral-link-url-input')
    .pressSequentially(`https://example.com/official-${suffix}`)
}
