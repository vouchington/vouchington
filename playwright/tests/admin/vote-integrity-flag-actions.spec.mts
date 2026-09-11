import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import {
  createTestUser,
  insertTestPost,
  insertTestPostVote,
  insertTestVoteIntegrityFlag,
} from '../../../backend/test-helpers/index.mts'

// Seeded test admin ID — the shared AUTH_STATE user; used as post author to avoid
// creating an extra user for test fixtures that only need a valid createdById.
const TEST_ADMIN_ID = '019f0000-0000-7000-8000-000000000000'

let resolveFlagId = ''
let penaltyFlagId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  // Post and flag for the resolve test — kept separate so the penalty test
  // can still assert button state after the resolve test runs.
  const resolvePostId = await insertTestPost({
    title: `VI resolve test ${suffix}`,
    slug: `vi-resolve-${suffix}`,
    createdById: TEST_ADMIN_ID,
    markdown: 'Vote integrity resolve test post.',
  })
  resolveFlagId = await insertTestVoteIntegrityFlag({ postId: resolvePostId })

  // Post, voter, vote, and flag for the penalty test.
  const penaltyPostId = await insertTestPost({
    title: `VI penalty test ${suffix}`,
    slug: `vi-penalty-${suffix}`,
    createdById: TEST_ADMIN_ID,
    markdown: 'Vote integrity penalty test post.',
  })
  const voter = await createTestUser({ username: `vi-voter-${suffix}` })
  if (!voter) throw new Error('Failed to create voter')
  await insertTestPostVote(penaltyPostId, voter.id, '192.168.200.1', 1)
  penaltyFlagId = await insertTestVoteIntegrityFlag({
    postId: penaltyPostId,
    flagType: 'ip_correlation',
  })
})

test.describe('Vote-integrity flag actions', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin resolves a pending flag after selecting a resolution', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/vote-integrity/flags')

    // Scope all assertions to the specific flag row by its id attribute.
    const flagRow = page.locator(`[data-flag-id="${resolveFlagId}"]`)
    await expect(flagRow).toBeVisible()

    // Resolution must be selected before the Resolve button becomes enabled.
    await flagRow.getByRole('combobox').click()
    await page.getByRole('listbox').getByRole('option', { name: 'Dismiss' }).click()
    await expect(page.getByRole('listbox')).toBeHidden()

    const resolveBtn = flagRow.getByTestId('resolve-flag-button')
    await expect(resolveBtn).toBeEnabled()

    // Register before clicking — PATCH /api/v1/vote-integrity/flags/:id
    const resolveResponse = page.waitForResponse(
      r =>
        r.ok() &&
        r.url().includes('/api/v1/vote-integrity/flags/') &&
        r.request().method() === 'PATCH',
    )
    await resolveBtn.click()
    await resolveResponse

    // Resolved flag no longer renders action buttons.
    await expect(resolveBtn).not.toBeAttached()
    await expect(page.getByTestId('vote-integrity-flag-reconciliation')).toHaveCount(0)
  })

  test('admin applies a ring penalty for a pending flag', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/vote-integrity/flags')

    const flagRow = page.locator(`[data-flag-id="${penaltyFlagId}"]`)
    await expect(flagRow).toBeVisible()

    const penaltyBtn = flagRow.getByTestId('apply-penalty-button')
    await expect(penaltyBtn).toContainText('Apply Penalty')

    // First click shows the confirm prompt — no network request yet.
    await penaltyBtn.click()
    await expect(penaltyBtn).toContainText('Confirm?')

    // Register before confirming — POST /api/v1/vote-integrity/flags/:id/penalties
    const penaltyResponse = page.waitForResponse(
      r =>
        r.ok() &&
        r.url().includes('/api/v1/vote-integrity/flags/') &&
        r.url().includes('/penalties'),
    )
    await penaltyBtn.click()
    await penaltyResponse

    // Button reflects the penalty count and is disabled once applied.
    await expect(penaltyBtn).toContainText('penalized')
    await expect(penaltyBtn).toBeDisabled()
  })
})
