import { AxeBuilder } from '@axe-core/playwright'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { expect, test, type Page } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'] as const
const CARD_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'
const COMMUNITY_SLUG = 'playwright-popular-community'

const publicRoutes = [
  { name: 'home page', path: '/' },
  { name: 'reviews page', path: '/reviews' },
  { name: 'discussions page', path: '/discussions' },
  { name: 'data-points page', path: '/data-points' },
  { name: 'topics page', path: '/topics' },
  { name: 'cards page', path: '/cards' },
  { name: 'domains page', path: '/domains' },
  { name: 'sources page', path: '/sources' },
  { name: 'communities page', path: '/communities' },
  { name: 'login page', path: '/login' },
  { name: 'posts page', path: '/posts' },
  { name: 'articles page', path: '/articles' },
  { name: 'blog page', path: '/blog' },
  { name: 'news page', path: '/news' },
  { name: 'referral-programs page', path: '/referral-programs' },
  { name: 'rewards-programs page', path: '/rewards-programs' },
  { name: 'plans page', path: '/plans' },
  { name: 'topic detail page', path: `/card/${CARD_ID}` },
  { name: 'topic posts subpage', path: `/card/${CARD_ID}/posts` },
  { name: 'discussion detail page', path: `/discussion/${DISCUSSION_ID}` },
  { name: 'public landing page', path: `/@${TEST_USER_USERNAME}` },
  { name: 'community detail page', path: `/communities/${COMMUNITY_SLUG}` },
] as const

const authenticatedRoutes = [
  { name: 'feed page', path: '/feed' },
  { name: 'feed news page', path: '/feed/news' },
  { name: 'feed podcasts page', path: '/feed/podcasts' },
  { name: 'my profile page', path: '/my/profile' },
  { name: 'my preferences page', path: '/my/preferences' },
  { name: 'my api keys page', path: '/my/api-keys' },
  { name: 'my data page', path: '/my/data' },
  { name: 'my notifications page', path: '/my/notifications' },
  { name: 'messages page', path: '/messages' },
] as const

const adminRoutes = [
  { name: 'urls page', path: '/urls' },
  { name: 'support contacts page', path: '/support/contacts' },
  { name: 'admin queues page', path: '/admin/queues' },
  { name: 'report integrity flags page', path: '/report-integrity/flags' },
  { name: 'post review queue page', path: '/posts/review-queue' },
] as const

async function assertNoAxeViolations(page: Page, path: string) {
  const results = await analyzePageA11y(page, path)
  const violationSummary = results.violations
    .map(
      violation => `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.description}`,
    )
    .join('\n')

  expect(
    results.violations,
    `Found ${results.violations.length} axe violations on ${path}:\n${violationSummary}`,
  ).toHaveLength(0)
}

async function analyzePageA11y(page: Page, path: string) {
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await navigateTo(page, path)
      return await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze()
    } catch (error) {
      lastError = error
      await page.waitForLoadState('load').catch(() => {})
    }
  }

  const errorToThrow =
    lastError instanceof Error
      ? lastError
      : new Error('Accessibility audit failed before axe analysis completed.')
  throw errorToThrow
}

test.describe('Accessibility audit @a11y', () => {
  test.describe('public routes', () => {
    for (const { name, path } of publicRoutes) {
      test(`${name} has no axe violations`, async ({ page }) => {
        await assertNoAxeViolations(page, path)
      })
    }
  })

  test.describe('authenticated routes', () => {
    test.use({ storageState: AUTH_STATE })

    for (const { name, path } of authenticatedRoutes) {
      test(`${name} has no axe violations`, async ({ page }) => {
        await assertNoAxeViolations(page, path)
      })
    }
  })

  test.describe('admin routes', () => {
    test.use({ storageState: AUTH_STATE })

    for (const { name, path } of adminRoutes) {
      test(`${name} has no axe violations`, async ({ page }) => {
        await assertNoAxeViolations(page, path)
      })
    }
  })
})
