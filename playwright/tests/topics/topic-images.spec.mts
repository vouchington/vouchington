import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { TEST_PNG } from '../../helpers/test-fixtures.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestImage } from '../../../backend/test-helpers/entities/images.mts'
import {
  allowTestTopicSurfaceImageDelivery,
  setTestTopicSurfaceImages,
} from '../../../backend/test-helpers/entities/image-surface-placements.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

const mockImages = (page: Page) =>
  page.route(
    url => new URL(url.toString()).pathname.startsWith('/images/'),
    route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
  )

test.describe('Topic Images - Upload UI', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  // Separate topics per scenario: each is seeded in beforeAll before any page navigates
  // there, so the entity cache is populated with the correct image IDs on first access.
  let plainTopicId: string
  let plainTopicType: string
  let logoTopicId: string
  let logoTopicType: string
  let heroTopicId: string
  let heroTopicType: string

  test.beforeAll(async () => {
    // Topic with no images — for the upload-button test
    const s1 = randomSuffix()
    const plain = await insertTestTopic(`Upload UI Test ${s1}`, `upload-ui-test-${s1}`)
    plainTopicId = plain.id
    plainTopicType = plain.urlSlug

    // Topic with logo pre-seeded before any cache population
    const s2 = randomSuffix()
    const logoTopic = await insertTestTopic(`Logo Test ${s2}`, `logo-test-${s2}`)
    logoTopicId = logoTopic.id
    logoTopicType = logoTopic.urlSlug
    const logoImageId = await insertTestImage(TEST_USER_ID)
    await setTestTopicSurfaceImages(logoTopicId, { logoImageId })
    await allowTestTopicSurfaceImageDelivery({
      topicId: logoTopicId,
      imageId: logoImageId,
      surfaceKind: 'topic-logo-image',
    })

    // Topic with hero pre-seeded before any cache population
    const s3 = randomSuffix()
    const heroTopic = await insertTestTopic(`Hero Test ${s3}`, `hero-test-${s3}`)
    heroTopicId = heroTopic.id
    heroTopicType = heroTopic.urlSlug
    const heroImageId = await insertTestImage(TEST_USER_ID)
    await setTestTopicSurfaceImages(heroTopicId, { heroImageId })
    await allowTestTopicSurfaceImageDelivery({
      topicId: heroTopicId,
      imageId: heroImageId,
      surfaceKind: 'topic-hero-image',
    })
  })

  test('shows upload buttons for logo and hero in admin edit page', async ({ page }) => {
    await navigateTo(page, `/${plainTopicType}/${plainTopicId}/settings/about`)

    await expect(page.getByTestId('topic-images-heading')).toBeVisible()
    await expect(page.getByTestId('topic-image-logo-upload')).toHaveCount(1)
    await expect(page.getByTestId('topic-image-hero-upload')).toHaveCount(1)
    await expect(page.getByTestId('topic-image-logo-upload-trigger')).toBeVisible()
    await expect(page.getByTestId('topic-image-hero-upload-trigger')).toBeVisible()
  })

  test('shows seeded topic logo preview in admin edit page', async ({ page }) => {
    await mockImages(page)

    await navigateTo(page, `/${logoTopicType}/${logoTopicId}/settings/about`)

    // Logo preview should appear
    const logoImg = page.getByTestId('logo-image-preview').locator('img')
    await expect(logoImg).toBeVisible()

    // Change logo button should appear
    await expect(page.getByTestId('topic-image-logo-upload-trigger')).toBeVisible()
    await expect(page.getByTestId('topic-image-logo-remove')).toBeVisible()
  })

  test('shows seeded topic hero preview in admin edit page', async ({ page }) => {
    await mockImages(page)

    await navigateTo(page, `/${heroTopicType}/${heroTopicId}/settings/about`)

    // Hero preview should appear
    const heroImg = page.getByTestId('hero-image-preview').locator('img')
    await expect(heroImg).toBeVisible()

    // Change/remove hero buttons should appear
    await expect(page.getByTestId('topic-image-hero-upload-trigger')).toBeVisible()
    await expect(page.getByTestId('topic-image-hero-remove')).toBeVisible()
  })
})

test.describe('Topic Images - Detail Page', () => {
  test.use({ storageState: AUTH_STATE })

  let topicId: string
  let topicType: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Detail Image Test Topic ${suffix}`,
      `detail-image-test-topic-${suffix}`,
    )
    topicId = topic.id
    topicType = topic.urlSlug

    const imageId = await insertTestImage(TEST_USER_ID)
    await setTestTopicSurfaceImages(topicId, { logoImageId: imageId })
    await allowTestTopicSurfaceImageDelivery({
      topicId,
      imageId,
      surfaceKind: 'topic-logo-image',
    })
  })

  test('shows logo on topic detail page', async ({ page }) => {
    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, `/${topicType}/${topicId}`)

    // Logo should display in the detail header
    const logoImg = page.getByTestId('topic-logo')
    await expect(logoImg).toBeVisible()
  })
})
