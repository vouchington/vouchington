import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { allowTestPostImageDelivery } from '../../../backend/test-helpers/entities/post-images.mts'
import {
  createTestUser,
  insertTestImage,
  insertTestModerationMediaReveals,
  insertTestPost,
  insertTestPostImage,
  setPostOpenAIModerationFlaggedOnly,
} from '../../../backend/test-helpers/index.mts'

// ---------------------------------------------------------------------------
// Sensitive-media blur gate (post page)
// ---------------------------------------------------------------------------

let moderatorId = ''
let sensitivePostSlug = ''

test.describe('Sensitive-media blur gate on post page', () => {
  test.beforeAll(async () => {
    const suffix = randomSuffix()

    const mod = await createTestUser({ username: `exposure-mod-${suffix}`, administrator: true })
    if (!mod) throw new Error('Failed to create moderator')
    moderatorId = mod.id

    sensitivePostSlug = `sensitive-post-${suffix}`
    const postId = await insertTestPost({
      createdById: mod.id,
      slug: sensitivePostSlug,
      title: `Sensitive Post ${suffix}`,
      markdown: 'A post with disturbing media.',
      clearanceStatus: 'in_review',
    })

    await setPostOpenAIModerationFlaggedOnly(postId, true)

    // Attach an image so PostDetailImages renders
    const imageId = await insertTestImage(mod.id)
    await insertTestPostImage({ postId, imageId })
    await allowTestPostImageDelivery({ postId, imageId })
  })

  test('moderator sees blur overlay on a flagged post', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, `/discussion/${sensitivePostSlug}`)

    await expect(page.getByTestId('sensitive-media')).toBeVisible()
    await expect(page.getByTestId('sensitive-media-reveal')).toBeVisible()
  })

  test('clicking reveal removes the blur gate', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, `/discussion/${sensitivePostSlug}`)

    await expect(page.getByTestId('sensitive-media')).toBeVisible()
    await page.getByTestId('sensitive-media-reveal').click()
    await expect(page.getByTestId('sensitive-media')).toBeHidden()
    await expect(page.getByTestId('sensitive-media-reveal')).toBeHidden()
  })
})

// ---------------------------------------------------------------------------
// Exposure cooldown gate + modal (review queue)
// ---------------------------------------------------------------------------

let cooldownModeratorId = ''

test.describe('Exposure cooldown gate in review queue', () => {
  test.beforeAll(async () => {
    const suffix = randomSuffix()

    const cooldownMod = await createTestUser({
      username: `cooldown-mod-${suffix}`,
      administrator: true,
    })
    if (!cooldownMod) throw new Error('Failed to create cooldown moderator')
    cooldownModeratorId = cooldownMod.id

    // Seed exactly threshold (10) reveals to put the moderator in cooldown
    await insertTestModerationMediaReveals(cooldownModeratorId, 10)
  })

  test('moderator in cooldown sees the exposure cooldown gate and modal', async ({ page }) => {
    await loginAsUser(page, cooldownModeratorId)
    await navigateTo(page, '/posts/review-queue')

    await expect(page.getByTestId('exposure-cooldown-gate')).toBeVisible()
    await expect(page.getByTestId('exposure-cooldown-modal')).toBeVisible()
    await expect(page.getByTestId('cooldown-countdown')).toBeVisible()
  })

  test('cooldown dismiss button is disabled while timer is running', async ({ page }) => {
    await loginAsUser(page, cooldownModeratorId)
    await navigateTo(page, '/posts/review-queue')

    await expect(page.getByTestId('cooldown-dismiss')).toBeDisabled()
  })
})
