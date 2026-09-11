import { expect, test, type Locator } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'
import { createTestCrmContact, createTestUser } from '../../../backend/test-helpers/index.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

const mobileViewport = { width: 375, height: 812 } as const
let crmSearch = ''

test.beforeAll(async () => {
  const admin = requireTestValue(
    await createTestUser({ administrator: true }),
    'Failed to create CRM admin',
  )
  crmSearch = `crm-pagination-${randomSuffix()}`
  await Promise.all(
    Array.from({ length: 26 }, (_, index) =>
      createTestCrmContact(admin, {
        name: `${crmSearch} contact ${index}`,
        email: `tests+${crmSearch}-${index}@voucha.ai`,
      }),
    ),
  )
})

async function assertLocatorTouchTarget(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)
}

test.describe('frontend design audit coverage', () => {
  test('public news actions keep mobile-safe targets and no horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize(mobileViewport)
    await navigateTo(page, '/news')

    await assertNoHorizontalScroll(page)
    await assertLocatorTouchTarget(page.getByTestId('navbar-search-button'))
    await assertLocatorTouchTarget(page.getByTestId('navbar-logo'))
    const voteLink = page.getByTestId('news-item-vote-sign-in').first()
    await expect(voteLink).toHaveAttribute('href', /next=.*intent=vote/)
    await assertLocatorTouchTarget(voteLink)
  })

  test('post list preview keeps a single page h1', async ({ page }) => {
    await page.setViewportSize(mobileViewport)
    await navigateTo(page, '/posts')

    await assertNoHorizontalScroll(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test('authenticated settings and admin shared shells render without mobile overflow', async ({
      page,
    }) => {
      await page.setViewportSize(mobileViewport)
      await navigateTo(page, '/my/profile')

      await assertNoHorizontalScroll(page)
      await expect(page.getByTestId('settings-page-header')).toBeVisible()

      await navigateTo(page, '/users')

      await assertNoHorizontalScroll(page)
      await assertLocatorTouchTarget(page.getByTestId('client-search-submit'))

      await navigateTo(page, `/crm?q=${crmSearch}`)

      await assertNoHorizontalScroll(page)
      await expect(page.getByTestId('admin-page-header')).toBeVisible()
      await expect(page.getByTestId('admin-table-shell')).toBeVisible()

      const adminPagination = page.getByTestId('admin-pagination')
      await expect(adminPagination).toBeVisible()
      await expect(adminPagination.getByRole('link').last()).toHaveAttribute('href', /after=/)
    })
  })
})
