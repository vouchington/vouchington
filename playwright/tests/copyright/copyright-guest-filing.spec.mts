import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '../../helpers/test.mts'
import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'
import {
  insertTestImage,
  insertTestPostImage,
} from '../../../backend/test-helpers/entities/images.mts'
import { allowTestPostImageDelivery } from '../../../backend/test-helpers/entities/post-images.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'

async function lookUpHostedUse(page: Page, path: string) {
  const targetUrl = page.getByLabel('Hosted use URL')
  await targetUrl.pressSequentially(`${new URL(page.url()).origin}${path}`)
  await page.getByRole('button', { name: 'Find hosted material' }).click()
}

test.describe('Signed-out copyright notice filing', () => {
  test('a missing post gets the same not-found copy with the designated-agent email path', async ({
    page,
  }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright/notices/new')

    await lookUpHostedUse(page, `/discussion/no-such-post-${randomSuffix()}`)

    const notFound = page.getByTestId('copyright-target-not-found')
    await expect(notFound).toBeVisible()
    await expect(notFound.getByRole('link')).toHaveAttribute('href', '/copyright/designated-agent')
  })

  test('a signed-out rights holder files a notice and sees how the case is tracked', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const slug = `copyright-guest-${suffix}`
    const postId = await insertTestPost({
      title: `Copyright guest filing ${suffix}`,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post with a hosted image.',
    })
    const imageId = await insertTestImage(TEST_USER_ID)
    await insertTestPostImage({ postId, imageId })
    await allowTestPostImageDelivery({ postId, imageId })

    // Copyright intake needs S3 and SES configuration that the Playwright stack does not have,
    // so only the submit is stubbed; the lookup above it runs against the real API as a guest.
    const noticeId = randomUUID()
    await page.route('**/api/v1/copyright-notices', route =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ copyright_notice: { id: noticeId }, is_duplicate: false }),
      }),
    )

    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright/notices/new')
    await page.getByLabel('Full legal name').pressSequentially(`Rights Holder ${suffix}`)
    await page.getByLabel('Mailing address').pressSequentially('1 Example Street, Springfield')
    await page.getByLabel('Email address').pressSequentially(`tests+${suffix}@voucha.ai`)
    await page.getByLabel('Copyrighted work').pressSequentially(`Photograph ${suffix}`)
    await lookUpHostedUse(page, `/discussion/${slug}`)
    await page.getByRole('checkbox').first().check()
    await page.getByLabel(/good-faith belief/).check()
    await page.getByLabel(/penalty of perjury/).check()
    await page.getByLabel('Electronic signature').pressSequentially(`Rights Holder ${suffix}`)
    await page.getByRole('button', { name: 'Submit notice' }).click()

    const receipt = page.getByTestId('copyright-guest-receipt')
    await expect(receipt).toContainText(noticeId)
    await expect(receipt).toContainText(`/copyright/notices/${noticeId}/guest`)
    await expect(page).toHaveURL(/\/copyright\/notices\/new$/)
  })
})
