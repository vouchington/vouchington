import { test, expect, withMonitoredPage } from '../../helpers/test.mts'
import { loginAsAdmin, loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Topic Recommendations page', () => {
  test.describe.configure({ mode: 'serial' })

  let topicSlug = ''
  let topicTitle = ''
  let approvedRecId = ''
  let approvedTopicSlug = ''
  let approvedTopicTitle = ''
  let rejectedRecId = ''
  let rejectedTopicSlug = ''
  let rejectedTopicTitle = ''

  test.beforeAll(async ({ browser }, testInfo) => {
    const suffix = randomSuffix()
    topicSlug = `pw-topic-rec-${suffix}`
    topicTitle = `Playwright Topic Rec ${suffix}`

    const approvedSuffix = randomSuffix()
    approvedTopicSlug = `pw-topic-rec-approved-${approvedSuffix}`
    approvedTopicTitle = `Playwright Approved Rec ${approvedSuffix}`

    const rejectedSuffix = randomSuffix()
    rejectedTopicSlug = `pw-topic-rec-rejected-${rejectedSuffix}`
    rejectedTopicTitle = `Playwright Rejected Rec ${rejectedSuffix}`

    // Create recommendations as the test user (who is also admin), then approve/reject in same session.
    // page.evaluate runs fetch in the browser context so the dt/st session cookies are sent correctly.
    await withMonitoredPage(browser, testInfo, async page => {
      await loginAsTestUser(page)

      // Create pending recommendation
      await page.evaluate(
        async data => {
          const res = await fetch('/api/v1/topic-recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
          })
          if (!res.ok) throw new Error(`Create rec1 failed: ${res.status} ${await res.text()}`)
        },
        {
          title: `Recommend ${topicTitle}`,
          markdown: 'Playwright test recommendation for E2E coverage.',
          topic_title: topicTitle,
          topic_slug: topicSlug,
        },
      )

      // Create recommendation to be approved
      const rec2 = await page.evaluate(
        async data => {
          const res = await fetch('/api/v1/topic-recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
          })
          if (!res.ok) throw new Error(`Create rec2 failed: ${res.status} ${await res.text()}`)
          return res.json() as Promise<{ post: { id: string } }>
        },
        {
          title: `Recommend ${approvedTopicTitle}`,
          markdown: 'Playwright approved recommendation.',
          topic_title: approvedTopicTitle,
          topic_slug: approvedTopicSlug,
        },
      )
      approvedRecId = rec2.post.id

      // Create recommendation to be rejected
      const rec3 = await page.evaluate(
        async data => {
          const res = await fetch('/api/v1/topic-recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
          })
          if (!res.ok) throw new Error(`Create rec3 failed: ${res.status} ${await res.text()}`)
          return res.json() as Promise<{ post: { id: string } }>
        },
        {
          title: `Recommend ${rejectedTopicTitle}`,
          markdown: 'Playwright rejected recommendation.',
          topic_title: rejectedTopicTitle,
          topic_slug: rejectedTopicSlug,
        },
      )
      rejectedRecId = rec3.post.id

      // Approve rec2 (test user is admin)
      await page.evaluate(async id => {
        const res = await fetch(`/api/v1/topic-recommendations/${id}/approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`Approve rec2 failed: ${res.status} ${await res.text()}`)
      }, approvedRecId)

      // Reject rec3
      await page.evaluate(
        async args => {
          const res = await fetch(`/api/v1/topic-recommendations/${args.id}/rejections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reason: args.reason }),
          })
          if (!res.ok) throw new Error(`Reject rec3 failed: ${res.status} ${await res.text()}`)
        },
        { id: rejectedRecId, reason: 'Playwright test rejection reason' },
      )
    })
  })

  test('unauthenticated users are redirected to login from /topic-recommendations', async ({
    page,
  }) => {
    await navigateTo(page, '/topic-recommendations')
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin sees breadcrumbs on the topic recommendations page', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-heading')).toBeVisible()
    // Breadcrumbs rendered at top
    await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toBeVisible()
    await expect(page.getByTestId('breadcrumb-link-topics')).toBeVisible()
  })

  test('admin sees the seeded pending recommendation', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()
    await expect(page.getByText(topicTitle)).toBeVisible()
  })

  test('submitter username link is visible in the row', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()
    // The row for the seeded pending rec shows the submitter link
    const submitterLink = page.getByTestId('topic-recommendation-row-submitter').first()
    await expect(submitterLink).toBeVisible()
  })

  test('status filter defaults to all when no status param', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    const statusFilter = page.getByTestId('topic-recommendation-status-filter')
    await expect(statusFilter).toBeVisible()
    await expect(statusFilter).toContainText('All')
  })

  test('status filter "All" removes status param from URL', async ({ page }) => {
    await loginAsAdmin(page)
    // Start with an explicit status param so clicking "All" produces an observable URL change
    await navigateTo(page, '/topic-recommendations?status=pending')

    await page.getByTestId('topic-recommendation-status-filter').click()
    await page.getByTestId('topic-recommendation-status-option-all').click()

    // "All" deletes the status param — URL returns to base path
    await expect(page).not.toHaveURL(/[?&]status=/)
    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()
  })

  test('search input filters recommendations by title', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.fill(topicSlug)
    await page.getByTestId('list-filters-search-submit').click()

    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(topicSlug)}`))
    await expect(page.getByText(topicTitle)).toBeVisible()
  })

  test('clicking recommendation title opens the modal', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    const titleBtn = page
      .getByTestId('topic-recommendation-row-title')
      .filter({ hasText: topicTitle })
    await expect(titleBtn).toBeVisible()
    await titleBtn.click()

    await expect(page.getByRole('dialog')).toBeVisible()
    // Dialog shows the recommendation title in its header
    await expect(page.getByRole('dialog').getByText(topicTitle)).toBeVisible()
  })

  test('modal shows prev/next navigation buttons', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    const titleBtn = page
      .getByTestId('topic-recommendation-row-title')
      .filter({ hasText: topicTitle })
    await expect(titleBtn).toBeVisible()
    await titleBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('topic-recommendation-dialog-previous')).toBeVisible()
    await expect(dialog.getByTestId('topic-recommendation-dialog-next')).toBeVisible()
    await expect(dialog.getByTestId('topic-recommendation-dialog-footer')).toBeVisible()
  })

  test('admin sees similarity panels in dialog after opening a recommendation', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    // Open the pending recommendation dialog
    const titleBtn = page
      .getByTestId('topic-recommendation-row-title')
      .filter({ hasText: topicTitle })
    await expect(titleBtn).toBeVisible()
    await titleBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The pre-filled topic_title drives the similarity query (length > 3)
    // Panels should appear after the debounce fires and API responds
    await expect(dialog.getByTestId('similarity-panels')).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText('Similar topics')).toBeVisible()
    await expect(dialog.getByText('Similar news')).toBeVisible()
    await expect(dialog.getByText('Similar posts')).toBeVisible()
  })

  test('admin sees quick Approve and Reject row buttons', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/topic-recommendations')

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    const row = page.getByRole('row').filter({ hasText: topicTitle })
    await expect(row.getByTestId('topic-recommendation-row-approve')).toBeVisible()
    await expect(row.getByTestId('topic-recommendation-row-reject')).toBeVisible()
  })

  test('approved recommendation shows approved-info in modal', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, `/topic-recommendations?status=approved`)

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    const titleBtn = page
      .getByTestId('topic-recommendation-row-title')
      .filter({ hasText: approvedTopicTitle })
    await expect(titleBtn).toBeVisible()
    await titleBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('topic-recommendation-approved-info')).toBeVisible()
    await expect(dialog.getByTestId('topic-recommendation-view-topic-link')).toBeVisible()
  })

  test('rejected recommendation shows rejected-info in modal', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, `/topic-recommendations?status=rejected`)

    await expect(page.getByTestId('topic-recommendations-table')).toBeVisible()

    const titleBtn = page
      .getByTestId('topic-recommendation-row-title')
      .filter({ hasText: rejectedTopicTitle })
    await expect(titleBtn).toBeVisible()
    await titleBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('topic-recommendation-rejected-info')).toBeVisible()
  })
})
