import { expect, test } from '../../helpers/test.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestBanEvasionFlag,
  insertTestSystemModerationReport,
  getTestActiveCommunityBan,
  reviewPendingTestModerationReportsByNotePrefixes,
} from '../../../backend/test-helpers/index.mts'
import { loginAsAdmin, loginAsUser, createSiteModeratorUser } from '../../helpers/auth.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe.configure({ mode: 'serial' })

const seededFlatReportsUrl = '/reports?cluster=none&sort=created_at_desc&limit=100'
const seededReportCreatedAt = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999))
const suiteReportNotePrefix = 'Suspected ban evasion ban-evasion-badge'

async function seedBanEvasionReport(suffix: string) {
  const source = await createTestUser({ username: `ban-source-${suffix}` })
  if (!source) throw new Error('Failed to create source user')

  const suspect = await createTestUser({ username: `ban-suspect-${suffix}` })
  if (!suspect) throw new Error('Failed to create suspect user')

  const communitySlug = `ban-evasion-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: source.id,
    visibility: 'public',
    slug: communitySlug,
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
    `${suiteReportNotePrefix} ${suffix}`,
    seededReportCreatedAt,
  )

  return { communitySlug, reportId, communityId: community.id, suspectId: suspect.id }
}

let communitySlug = ''
let reportId = ''

test.beforeAll(async () => {
  await reviewPendingTestModerationReportsByNotePrefixes([suiteReportNotePrefix])
  const result = await seedBanEvasionReport(randomSuffix())
  communitySlug = result.communitySlug
  reportId = result.reportId
})

test.describe('Ban-evasion badge in admin reports queue', () => {
  test('admin sees ban-evasion badge on flagged user report', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededFlatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const reportRow = page.locator(`[data-moderation-queue-key="${reportId}"]`)
    await expect(reportRow).toBeVisible()
    await expect(reportRow.getByTestId('ban-evasion-badge')).toBeVisible()
  })

  test('admin can open ban-evasion detail popover', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededFlatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const reportRow = page.locator(`[data-moderation-queue-key="${reportId}"]`)
    await expect(reportRow).toBeVisible()
    await reportRow.getByTestId('ban-evasion-badge').click()

    await expect(page.getByTestId('ban-evasion-detail')).toBeVisible()
    await expect(page.getByTestId('ban-evasion-detail')).toContainText('Suspected ban evasion')
    await expect(page.getByTestId('ban-evasion-detail')).toContainText(communitySlug)
  })

  test('admin sees confirm and dismiss ban-evasion buttons', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededFlatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const reportRow = page.locator(`[data-moderation-queue-key="${reportId}"]`)
    await expect(reportRow).toBeVisible()
    await expect(reportRow.getByTestId('ban-evasion-confirm')).toBeVisible()
    await expect(reportRow.getByTestId('ban-evasion-dismiss')).toBeVisible()
  })

  // Dismiss mutates its own isolated fixture to avoid interfering with the read-only tests above.
  test.describe('dismiss action', () => {
    let dismissReportId = ''

    test.beforeAll(async () => {
      const result = await seedBanEvasionReport(randomSuffix())
      dismissReportId = result.reportId
    })

    test('admin can dismiss the ban-evasion flag', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateTo(page, seededFlatReportsUrl)

      await expect(page.getByTestId('reports-list')).toBeVisible()

      const reportRow = page.locator(`[data-moderation-queue-key="${dismissReportId}"]`)
      await expect(reportRow).toBeVisible()
      const dismissBtn = reportRow.getByTestId('ban-evasion-dismiss')
      await expect(dismissBtn).toBeVisible()
      await dismissBtn.click()

      // After dismiss, the specific report row disappears from the pending queue
      await expect(reportRow).toBeHidden()
    })
  })
})

test.describe('Ban-evasion badge — Site Moderator', () => {
  let smModeratorId = ''
  let smReportId = ''

  test.beforeAll(async () => {
    const moderator = await createSiteModeratorUser()
    smModeratorId = moderator.id
    const result = await seedBanEvasionReport(randomSuffix())
    smReportId = result.reportId
  })

  test('site moderator sees ban-evasion controls on /reports', async ({ page }) => {
    await loginAsUser(page, smModeratorId)
    await navigateTo(page, seededFlatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const reportRow = page.locator(`[data-moderation-queue-key="${smReportId}"]`)
    await expect(reportRow).toBeVisible()
    await expect(reportRow.getByTestId('ban-evasion-badge')).toBeVisible()
    await expect(reportRow.getByTestId('ban-evasion-confirm')).toBeVisible()
    await expect(reportRow.getByTestId('ban-evasion-dismiss')).toBeVisible()
  })

  test('site moderator can dismiss the ban-evasion flag', async ({ page }) => {
    const result = await seedBanEvasionReport(randomSuffix())
    await loginAsUser(page, smModeratorId)
    await navigateTo(page, seededFlatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const reportRow = page.locator(`[data-moderation-queue-key="${result.reportId}"]`)
    await expect(reportRow).toBeVisible()
    await reportRow.getByTestId('ban-evasion-dismiss').click()

    await expect(reportRow).toBeHidden()
  })
})

test.describe('Ban-evasion badge — SA confirm', () => {
  test.use({ storageState: AUTH_STATE })

  let saReportId = ''
  let saConfirmCommunityId = ''
  let saConfirmSuspectId = ''

  test.beforeAll(async () => {
    const result = await seedBanEvasionReport(randomSuffix())
    saReportId = result.reportId
    saConfirmCommunityId = result.communityId
    saConfirmSuspectId = result.suspectId
  })

  test('admin can confirm ban-evasion flag and ban is created', async ({ page }) => {
    await navigateTo(page, seededFlatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const reportRow = page.locator(`[data-moderation-queue-key="${saReportId}"]`)
    await expect(reportRow).toBeVisible()

    const confirmBtn = reportRow.getByTestId('ban-evasion-confirm')
    await expect(confirmBtn).toBeVisible()

    const confirmResponse = page.waitForResponse(
      resp => resp.url().includes('/ban-evasion') && resp.request().method() === 'POST',
    )
    await confirmBtn.click()
    await confirmResponse

    // Verify the ban was created in the database
    const ban = await getTestActiveCommunityBan(saConfirmCommunityId, saConfirmSuspectId)
    expect(ban).not.toBeNull()
  })
})
