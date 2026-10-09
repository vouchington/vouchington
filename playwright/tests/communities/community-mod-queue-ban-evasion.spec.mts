import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestBanEvasionFlag,
  insertTestSystemModerationReport,
} from '../../../backend/test-helpers/index.mts'

const seededReportCreatedAt = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999))

async function seedCommunityBanEvasionReport(suffix: string) {
  const source = await createTestUser({ username: `cbe-source-${suffix}` })
  if (!source) throw new Error('Failed to create source user')
  const suspect = await createTestUser({ username: `cbe-suspect-${suffix}` })
  if (!suspect) throw new Error('Failed to create suspect user')

  const slug = `cbe-queue-${suffix}`
  const community = await insertTestCommunity({
    createdById: source.id,
    visibility: 'public',
    slug,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: source.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })

  await setTestBanEvasionFlag({
    communityId: community.id,
    userId: suspect.id,
    sourceUserId: source.id,
    score: 0.85,
  })
  const reportId = await insertTestSystemModerationReport(
    'user',
    suspect.id,
    `Suspected ban evasion ${suffix}`,
    seededReportCreatedAt,
    community.id,
  )

  return { slug, communityId: community.id, sourceId: source.id, suspectId: suspect.id, reportId }
}

test.describe('Community mod queue — ban-evasion badge', () => {
  let banEvasionCommunitySlug = ''
  let banEvasionOwnerId = ''

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    const result = await seedCommunityBanEvasionReport(suffix)
    banEvasionCommunitySlug = result.slug
    banEvasionOwnerId = result.sourceId
  })

  test('owner sees redacted ban-evasion badge in community mod queue', async ({ page }) => {
    await loginAsUser(page, banEvasionOwnerId)
    await navigateTo(page, `/communities/${banEvasionCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('mod-queue-reports')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-badge')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-confirm')).not.toBeAttached()
    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()
  })

  test('owner can dismiss the ban-evasion flag from community mod queue', async ({ page }) => {
    const { slug, sourceId } = await seedCommunityBanEvasionReport(randomSuffix())
    await loginAsUser(page, sourceId)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()
    await page.getByTestId('community-ban-evasion-dismiss').click()

    await expect(page.getByTestId('community-ban-evasion-badge')).not.toBeAttached()
  })
})
