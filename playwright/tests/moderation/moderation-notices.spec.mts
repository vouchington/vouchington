import { expect, test } from '../../helpers/test.mts'
import {
  createTestUser,
  insertTestPost,
  suspendTestUser,
} from '../../../backend/test-helpers/index.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

// ---------------------------------------------------------------------------
// Suspension banner
// ---------------------------------------------------------------------------

let suspendedUserId = ''
let authorUserId = ''
let rejectedPostSlug = ''
let adminUserId = ''

// A single top-level beforeAll seeds fixtures for all describe blocks below — several later
// blocks (e.g. "/my/account-status page") reuse ids from earlier sections, so each fixture must
// stay in file scope rather than nested per describe.
test.beforeAll(async () => {
  const suspendedUserSuffix = randomSuffix()
  const user = await createTestUser({ username: `suspended-user-${suspendedUserSuffix}` })
  if (!user) throw new Error('Failed to create suspended test user')
  suspendedUserId = user.id

  await suspendTestUser(user.id, 'Violation of community guidelines — playwright test.')

  const removedPostSuffix = randomSuffix()
  const author = await createTestUser({ username: `removed-post-author-${removedPostSuffix}` })
  if (!author) throw new Error('Failed to create post author test user')
  authorUserId = author.id

  rejectedPostSlug = `removed-post-${removedPostSuffix}`
  await insertTestPost({
    title: `Removed post ${removedPostSuffix}`,
    slug: rejectedPostSlug,
    createdById: author.id,
    markdown: 'This is a post that was removed by a moderator.',
    postType: 'discussion',
    clearanceStatus: 'rejected',
  })

  const adminSuffix = randomSuffix()
  const admin = await createTestUser({
    username: `staff-reviewer-${adminSuffix}`,
    administrator: true,
  })
  if (!admin) throw new Error('Failed to create admin test user')
  adminUserId = admin.id
})

test.describe('Suspension banner', () => {
  test('suspended user sees the suspension banner', async ({ page }) => {
    await loginAsUser(page, suspendedUserId)
    await navigateTo(page, '/discussions')

    await expect(page.getByTestId('suspension-banner')).toBeVisible()
    await expect(page.getByTestId('suspension-banner')).toContainText('suspended')
  })

  test('suspension banner links to /my/account-status', async ({ page }) => {
    await loginAsUser(page, suspendedUserId)
    await navigateTo(page, '/discussions')

    const link = page.getByTestId('suspension-banner').getByRole('link', { name: 'Learn more' })
    await expect(link).toHaveAttribute('href', '/my/account-status')
  })
})

// ---------------------------------------------------------------------------
// Content-removed notice
// ---------------------------------------------------------------------------

test.describe('Content-removed notice in post card', () => {
  test('author sees content-removed notice on their rejected post card', async ({ page }) => {
    await loginAsUser(page, authorUserId)
    await navigateTo(page, '/discussions?sort=new')

    await expect(page.getByTestId('content-removed-notice').first()).toBeVisible()
    await expect(page.getByTestId('content-removed-notice').first()).toContainText(
      'removed by a moderator',
    )
  })

  test('content-removed notice links to /my/appeals', async ({ page }) => {
    await loginAsUser(page, authorUserId)
    await navigateTo(page, '/discussions?sort=new')

    const notice = page.getByTestId('content-removed-notice').first()
    await expect(notice).toBeVisible()

    const link = notice.getByRole('link', { name: 'View appeals' })
    await expect(link).toHaveAttribute('href', '/my/appeals')
  })
})

// ---------------------------------------------------------------------------
// Staff reviewer sees "Under review" badge on rejected posts
// ---------------------------------------------------------------------------

test.describe('Staff reviewer sees Under review badge', () => {
  test('admin user sees review-status-badge on rejected post card', async ({ page }) => {
    await loginAsUser(page, adminUserId)
    await navigateTo(page, '/discussions?sort=new')

    await expect(page.getByTestId('post-card-review-badge').first()).toBeVisible()
    await expect(page.getByTestId('post-card-review-badge').first()).toContainText('Under review')
  })

  test('admin user sees review-status-badge on rejected post detail page', async ({ page }) => {
    await loginAsUser(page, adminUserId)
    await navigateTo(page, `/discussion/${rejectedPostSlug}`)

    await expect(page.getByTestId('post-detail-review-badge')).toBeVisible()
    await expect(page.getByTestId('post-detail-review-badge')).toContainText('Under review')
  })
})

// ---------------------------------------------------------------------------
// /my/account-status page
// ---------------------------------------------------------------------------

test.describe('/my/account-status page', () => {
  test('suspended user sees suspended alert on account-status page', async ({ page }) => {
    await loginAsUser(page, suspendedUserId)
    await navigateTo(page, '/my/account-status')

    await expect(page.getByTestId('my-account-status-page')).toBeVisible()
    await expect(page.getByTestId('my-account-status-page')).toContainText('suspended')
  })

  test('non-suspended user sees good standing alert on account-status page', async ({ page }) => {
    await loginAsUser(page, authorUserId)
    await navigateTo(page, '/my/account-status')

    await expect(page.getByTestId('my-account-status-page')).toBeVisible()
    await expect(page.getByTestId('my-account-status-page')).toContainText('good standing')
  })
})
