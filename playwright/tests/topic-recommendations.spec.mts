import { expect, test } from '../helpers/test.mts'
import { loginAsAdmin, loginAsTestUser, loginAsUser } from '../helpers/auth.mts'
import { navigateTo, randomSuffix, requireTestValue } from 'vouchington-tooling/playwright'
import { chooseVote, voteBinaryChoice } from '../helpers/semantic-vote.mts'
import { createEligibleTestUser } from '../helpers/contribution-users.mts'
import { createTestUser } from '../../backend/test-helpers/index.mts'

async function ensureSidebarOpen(page: Parameters<typeof navigateTo>[0]) {
  const sidebarPeer = page.getByTestId('sidebar-peer')
  if ((await sidebarPeer.getAttribute('data-state')) !== 'expanded') {
    await page.getByTestId('sidebar-trigger').click()
  }
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  await expect(sidebar).toBeVisible()
  return sidebar
}

test.describe('Topic Recommendations', () => {
  test('signed-in users can reach the queue from the sidebar and create flow from Write', async ({
    page,
  }) => {
    const user = requireTestValue(
      await createTestUser({ username: `topic-rec-nav-${randomSuffix()}` }),
      'Failed to create test user',
    )

    await loginAsUser(page, user.id)
    // Navigate to the topics intent so the recommendations link is visible.
    // loginAsUser injects cookies without re-rendering, so the sidebar would show
    // anonymous content if we don't navigate first. sidebar-nav-recommendations
    // lives in the topics intent Browse group (requiresAuth: true).
    await navigateTo(page, '/topics')
    const sidebar = await ensureSidebarOpen(page)
    await sidebar.getByTestId('sidebar-nav-recommendations').click()
    await expect(page).toHaveURL(/\/topic-recommendations$/)
    await expect(page.getByTestId('topic-recommendations-heading')).toBeVisible()

    await page.getByTestId('navbar-write-button').click()
    await page.getByTestId('write-dialog-link-topic-recommendations-create').click()
    await expect(page).toHaveURL(/\/topic-recommendations\/create$/)
    await expect(page.getByTestId('suggest-topic-heading')).toBeVisible()
  })

  test('admins can reach the topic recommendation review queue from CMS navigation', async ({
    page,
  }) => {
    await loginAsTestUser(page)
    // Navigate to the topics intent so the recommendations link is visible.
    // sidebar-nav-recommendations lives in the topics intent Browse group.
    await navigateTo(page, '/topics')
    const sidebar = await ensureSidebarOpen(page)
    await sidebar.getByTestId('sidebar-nav-recommendations').click()

    await expect(page).toHaveURL(/\/topic-recommendations$/)
    await expect(page.getByTestId('topic-recommendations-heading')).toBeVisible()
    await expect(page.getByTestId('new-topic-recommendation-link')).toBeVisible()
  })

  test('signed-in users can filter the top hashtags tab', async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-tabs')).toBeVisible()
    await expect(page.getByTestId('topic-recommendations-tab')).toBeVisible()
    await page.getByTestId('top-hashtags-tab').click()
    const hashtags = page.getByTestId('top-hashtags')
    await expect(hashtags).toBeVisible()
    const search = hashtags.getByTestId('top-hashtags-search')
    await search.pressSequentially('credit.cards')
    await expect(search).toHaveValue('credit-cards')
    await search.press('Enter')
    await expect(hashtags.getByTestId('top-hashtags-mapping')).toBeVisible()
  })

  test('logged-in user can create and approve a topic recommendation', async ({ page }) => {
    const stamp = randomSuffix()
    const topicTitle = `Playwright Topic ${stamp}`
    const topicSlug = `playwright-topic-${stamp}`

    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')
    await expect(page.getByTestId('topic-recommendations-heading')).toBeVisible()
    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    await page.getByTestId('new-topic-recommendation-link').click()
    await page.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('A topic created from the browser test.')
    await page
      .getByTestId('topic-recommendation-form-topic-hostname')
      .fill(`playwright-${stamp}.example.com`)
    await page
      .getByTestId('topic-recommendation-form-topic-hostnames')
      .fill(`playwright-${stamp}.example.com`)
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This topic is repeatedly discussed and should be promoted into the topic catalog.')
    // The Turnstile widget is required to create; the stub (installed by navigateTo) resolves a
    // token so the submit button enables.
    await expect(page.getByTestId('turnstile-container')).toBeVisible()
    await page.getByTestId('topic-recommendation-form-submit').click()

    await expect(page).toHaveURL(/\/topic-recommendations$/)
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(topicTitle)}`)
    await expect(page.getByTestId(`topic-recommendation-row-${topicSlug}`)).toBeVisible()

    await page
      .getByTestId(`topic-recommendation-row-${topicSlug}`)
      .getByTestId('topic-recommendation-row-title')
      .click()
    const approveButton = page.getByTestId('topic-recommendation-dialog-approve')
    await expect(approveButton).toBeEnabled()
    await Promise.all([page.waitForURL(/\/topic\//), approveButton.click()])
  })

  test('signed-in user can support a pending recommendation', async ({ page }) => {
    const userA = requireTestValue(
      await createEligibleTestUser(`topic-rec-vouch-a-${randomSuffix()}`),
      'Failed to create test user A',
    )
    const userB = requireTestValue(
      await createEligibleTestUser(`topic-rec-vouch-b-${randomSuffix()}`),
      'Failed to create test user B',
    )

    const stamp = randomSuffix()
    const topicTitle = `Vouch Topic ${stamp}`
    const topicSlug = `vouch-topic-${stamp}`

    // User A creates the recommendation
    await loginAsUser(page, userA.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('A topic that will be vouched for by another user.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This recommendation exists only to test user vouching.')
    await page.getByTestId('topic-recommendation-form-submit').click()
    await expect(page).toHaveURL(/\/topic-recommendations$/)

    // A different non-admin user vouches for the recommendation.
    await loginAsUser(page, userB.id)
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(topicTitle)}`)

    const row = page.getByTestId(`topic-recommendation-row-${topicSlug}`)
    await expect(row).toBeVisible()

    const vouchPromise = page.waitForResponse(
      resp => /\/api\/v1\/posts\/[^/]+\/vote/.test(resp.url()) && resp.ok(),
    )
    await chooseVote(row, 'score-vote', 'support')
    await vouchPromise

    await expect(row).toBeVisible()
    await expect(voteBinaryChoice(row, 'score-vote', 'support')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('author can withdraw a pending topic recommendation', async ({ page }) => {
    const user = requireTestValue(
      await createEligibleTestUser(`topic-rec-withdraw-${randomSuffix()}`),
      'Failed to create test user',
    )

    const stamp = randomSuffix()
    const topicTitle = `Withdraw Topic ${stamp}`
    const topicSlug = `withdraw-topic-${stamp}`

    await loginAsUser(page, user.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('A topic that will be withdrawn.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This recommendation exists only to test author withdrawal.')
    await page.getByTestId('topic-recommendation-form-submit').click()

    await expect(page).toHaveURL(/\/topic-recommendations$/)
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(topicTitle)}`)
    await expect(page.getByTestId(`topic-recommendation-row-${topicSlug}`)).toBeVisible()

    const row = page.getByTestId(`topic-recommendation-row-${topicSlug}`)
    await row.getByTestId('topic-recommendation-row-withdraw').click()
    const dialog = page.getByTestId('topic-recommendation-withdraw-dialog')
    await expect(dialog.getByTestId('topic-recommendation-withdraw-description')).toBeVisible()
    await dialog.getByTestId('topic-recommendation-withdraw-confirm').click()

    await expect(page.getByTestId(`topic-recommendation-row-${topicSlug}`)).toBeHidden()
  })

  test('non-admin owner sees edit link for their pending recommendation', async ({ page }) => {
    const user = requireTestValue(
      await createEligibleTestUser(`topic-rec-edit-${randomSuffix()}`),
      'Failed to create test user',
    )

    const stamp = randomSuffix()
    const topicTitle = `Edit Topic ${stamp}`
    const topicSlug = `edit-topic-${stamp}`

    await loginAsUser(page, user.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page.getByTestId('topic-recommendation-form-topic-markdown').fill('A topic to edit.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This recommendation exists to test the owner edit link.')
    await page.getByTestId('topic-recommendation-form-submit').click()

    await expect(page).toHaveURL(/\/topic-recommendations$/)
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(topicTitle)}`)

    const row = page.getByTestId(`topic-recommendation-row-${topicSlug}`)
    await expect(row).toBeVisible()
    await expect(row.getByTestId('topic-recommendation-row-edit')).toBeVisible()
    await row.getByTestId('topic-recommendation-row-edit').click()
    await expect(page).toHaveURL(/\/topic-recommendations\/[^/]+\/edit$/)
  })
})
