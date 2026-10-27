import { expect, test } from '../helpers/test.mts'
import { loginAsUser } from '../helpers/auth.mts'
import { navigateTo, randomSuffix, requireTestValue } from 'vouchington-tooling/playwright'
import { createEligibleTestUser } from '../helpers/contribution-users.mts'

test.describe('typed topic recommendations', () => {
  test('user can submit a Referral Program recommendation with an example referral link', async ({
    page,
  }) => {
    const stamp = randomSuffix()
    const topicTitle = `Playwright Referral Program ${stamp}`
    const topicSlug = `playwright-referral-program-${stamp}`
    const exampleLink = `https://example-${stamp}.com/referral?ref=test`

    const user = requireTestValue(
      await createEligibleTestUser(`topic-rec-referral-${stamp}`),
      'Failed to create eligible referral recommender',
    )
    await loginAsUser(page, user.id)

    await navigateTo(page, '/topic-recommendations/create')
    await expect(page.getByTestId('suggest-topic-heading')).toBeVisible()

    // Open the topic type Select, wait for the listbox, then pick Referral Program
    await page.getByTestId('topic-recommendation-form-topic-type').click()
    await page.getByRole('listbox').waitFor()
    await page.getByRole('listbox').getByRole('option', { name: 'Referral Program' }).click()

    // The example referral link field should now be visible
    await expect(page.getByTestId('topic-recommendation-form-example-referral-link')).toBeVisible()

    await page.getByTestId('topic-recommendation-form-topic-title').pressSequentially(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page.getByTestId('topic-recommendation-form-example-referral-link').fill(exampleLink)
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .pressSequentially('This referral program deserves a topic.')

    await page.getByTestId('topic-recommendation-form-submit').click()
    await expect(page).toHaveURL(/\/topic-recommendations$/)
  })

  test('user can submit a Card recommendation with landing page URLs', async ({ page }) => {
    const stamp = randomSuffix()
    const topicTitle = `Playwright Card ${stamp}`
    const topicSlug = `playwright-card-${stamp}`

    const user = requireTestValue(
      await createEligibleTestUser(`topic-rec-card-${stamp}`),
      'Failed to create eligible card recommender',
    )
    await loginAsUser(page, user.id)

    await navigateTo(page, '/topic-recommendations/create')
    await expect(page.getByTestId('suggest-topic-heading')).toBeVisible()

    // Open the topic type Select, wait for the listbox, then pick Card
    await page.getByTestId('topic-recommendation-form-topic-type').click()
    await page.getByRole('listbox').waitFor()
    await page.getByRole('listbox').getByRole('option', { name: 'Card' }).click()

    // The landing page URLs field should now be visible — fill it before other fields
    const landingPageUrlsField = page.getByTestId('topic-recommendation-form-landing-page-urls')
    await expect(landingPageUrlsField).toBeVisible()
    await landingPageUrlsField.fill(`https://bank-${stamp}.example.com/card-apply`)

    await page.getByTestId('topic-recommendation-form-topic-title').pressSequentially(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .pressSequentially('This card deserves a topic.')

    await page.getByTestId('topic-recommendation-form-submit').click()
    await expect(page).toHaveURL(/\/topic-recommendations$/)
  })
})
