import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'

// The 6 user-selectable topic types in the edit picker (rss_feed is excluded because
// Source topics can only be created via URL ingestion, not manually converted).
const SURVIVING_TYPE_VALUES = [
  'topic',
  'rewards_program',
  'rewards_program_status',
  'referral_program',
  'card',
  'bank_account',
] as const

const REMOVED_TYPE_VALUES = [
  'person',
  'brand',
  'organization',
  'public_figure',
  'rss_feed',
] as const

test.describe('Topic types consolidation', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  test('topic type picker offers exactly the 6 user-selectable types', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(`Types Topic ${suffix}`, `types-topic-${suffix}`)

    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/behavior`)
    await page.getByTestId('topic-settings-behavior').waitFor()
    await expect(page.getByTestId('topic-type-heading')).toBeVisible()

    await page.getByTestId('topic-type-trigger').click()

    for (const value of SURVIVING_TYPE_VALUES) {
      await expect(page.getByTestId(`topic-type-option-${value}`)).toBeVisible()
    }
    // Exactly 6 options, no more.
    await expect(page.getByRole('option')).toHaveCount(SURVIVING_TYPE_VALUES.length)

    for (const value of REMOVED_TYPE_VALUES) {
      await expect(page.getByTestId(`topic-type-option-${value}`)).toHaveCount(0)
    }
  })

  test('rss_feed topic settings show "Source" label and disabled trigger', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Source Topic ${suffix}`,
      `source-topic-${suffix}`,
      'rss_feed',
    )

    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/behavior`)
    await page.getByTestId('topic-settings-behavior').waitFor()
    await expect(page.getByTestId('topic-type-heading')).toBeVisible()

    const trigger = page.getByTestId('topic-type-trigger')
    // Trigger must render "Source", not the placeholder ("-- Select Type --"),
    // because the settings page uses TOPIC_TYPE_OPTIONS (which includes rss_feed)
    // when topicTypeValue === 'rss_feed', so the SelectValue finds a matching item.
    await expect(trigger).toHaveText('Source')
    await expect(trigger).toBeDisabled()
  })

  test('reviews subpage returns 404 for a not-reviewable noindex topic', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `No Reviews Topic ${suffix}`,
      `no-reviews-topic-${suffix}`,
      'topic',
      { noindex: true, allowReviews: false },
    )

    const response = await page.goto(`/${topic.urlSlug}/${topic.id}/reviews`)
    expect(response?.status()).toBe(404)
  })

  test('reviews subpage renders for a reviewable topic', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Reviewable Topic ${suffix}`,
      `reviewable-topic-${suffix}`,
      'topic',
      { allowReviews: true },
    )

    const response = await page.goto(`/${topic.urlSlug}/${topic.id}/reviews`)
    expect(response?.status()).toBe(200)
  })

  test('Visibility flags can be toggled and persisted', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(`Flags Topic ${suffix}`, `flags-topic-${suffix}`)

    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/behavior`)
    await page.getByTestId('topic-settings-behavior').waitFor()

    await expect(page.getByTestId('topic-flags-section')).toBeVisible()
    await expect(page.getByTestId('topic-flags-heading')).toBeVisible()

    const noindex = page.getByTestId('topic-noindex')
    const allowReviews = page.getByTestId('topic-allow-reviews')
    // Defaults: noindex off, reviews allowed.
    await expect(noindex).toHaveAttribute('aria-checked', 'false')
    await expect(allowReviews).toHaveAttribute('aria-checked', 'true')

    await noindex.click()
    await allowReviews.click()

    // Wait for the PATCH to persist before navigating away (the click only dispatches it).
    const savePersisted = page.waitForResponse(
      response =>
        response.url().includes(`/api/v1/topics/${topic.id}`) &&
        response.request().method() === 'PATCH' &&
        response.ok(),
    )
    await page.getByTestId('save-topic-flags').click()
    await savePersisted

    // Reload and confirm the toggles persisted.
    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/behavior`)
    await page.getByTestId('topic-settings-behavior').waitFor()
    await expect(page.getByTestId('topic-noindex')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('topic-allow-reviews')).toHaveAttribute('aria-checked', 'false')
  })
})
