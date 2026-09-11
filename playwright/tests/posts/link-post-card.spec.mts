import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestLinkPostWithCrawl } from '../../../backend/test-helpers/entities/link-posts.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { PLAYWRIGHT_SIDELOAD_IMAGE_URL } from '../../../lambdas/playwright-podcast-cover.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Link post card', () => {
  test.use({ storageState: AUTH_STATE })

  test('link post with thumbnail shows article embed card in post list', async ({ page }) => {
    await insertTestLinkPostWithCrawl({
      createdById: TEST_USER_ID,
      crawlTitle: 'Test Article with Thumbnail',
      thumbnailUrl: PLAYWRIGHT_SIDELOAD_IMAGE_URL,
    })
    await navigateTo(page, '/posts?sort=new')
    await expect(page.getByTestId('link-post-article-embed-card').first()).toBeVisible()
  })
})
