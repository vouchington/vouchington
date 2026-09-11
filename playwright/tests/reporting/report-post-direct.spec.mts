import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { createTestUser, insertTestPost } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const target = await createTestUser({ username: `rpt-card-target-${suffix}` })
  if (!target) throw new Error('Failed to create target user')

  await insertTestPost({
    title: `Report card test post ${suffix}`,
    slug: `rpt-card-post-${suffix}`,
    createdById: target.id,
    markdown: 'Post used for report card button test.',
  })
})

test.describe('Report post card — always-present affordance', () => {
  test.use({ storageState: AUTH_STATE })

  test('post-card-report-button is visible on post cards for non-owner', async ({ page }) => {
    await navigateTo(page, '/discussions?sort=new')
    await waitForBelowFoldHydration(page)
    // Scope to the seeded post card to avoid non-determinism from concurrent test posts.
    // data-post-slug is on the same element as data-pw="post-card-root", so use .and()
    // to intersect locators on the same element (filter({ has }) matches descendants only).
    const seededCard = page
      .getByTestId('post-card-root')
      .and(page.locator('[data-post-slug^="rpt-card-post-"]'))
      .first()
    await expect(seededCard.getByTestId('post-card-report-button')).toBeVisible({
      timeout: 10_000,
    })
  })
})
