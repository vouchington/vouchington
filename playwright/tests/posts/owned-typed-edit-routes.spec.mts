import { expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestPost } from '../../../backend/test-helpers/entities/create-test-entities.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Owned typed post edit routes', () => {
  test('data-point cancel discards the hydrated edit without changing the real post', async ({
    page,
  }) => {
    const user = await withCleanUser(page)
    const title = `Owned data-point ${randomSuffix()}`
    const post = await createTestPost({ user, title, post_type: 'data_point' })
    await navigateTo(page, `/data-point/${post.id}`)
    await expect(page.getByTestId('post-detail-heading')).toContainText(title)
    await navigateTo(page, `/data-point/${post.id}/edit`)
    await expect(page.getByTestId('edit-post-page-heading')).toHaveText('Edit Data Point')
    const input = page.getByTestId('post-form-title-input')
    await expect(input).toHaveValue(title)
    await input.press('ControlOrMeta+A')
    await input.pressSequentially(`${title} discarded edit`)
    await expect(input).toHaveValue(`${title} discarded edit`)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByTestId('post-detail-heading')).toContainText(title)
    await navigateTo(page, `/data-point/${post.id}/edit`)
    await expect(input).toHaveValue(title)
  })

  test('review cancel discards the hydrated edit without changing the real post', async ({
    page,
  }) => {
    const user = await withCleanUser(page)
    const title = `Owned review ${randomSuffix()}`
    const post = await createTestPost({ user, title, post_type: 'review' })
    await navigateTo(page, `/review/${post.id}`)
    await expect(page.getByTestId('post-detail-heading')).toContainText(title)
    await navigateTo(page, `/review/${post.id}/edit`)
    await expect(page.getByTestId('edit-post-page-heading')).toHaveText('Edit Review')
    const input = page.getByTestId('post-form-title-input')
    await expect(input).toHaveValue(title)
    await input.press('ControlOrMeta+A')
    await input.pressSequentially(`${title} discarded edit`)
    await expect(input).toHaveValue(`${title} discarded edit`)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByTestId('post-detail-heading')).toContainText(title)
    await navigateTo(page, `/review/${post.id}/edit`)
    await expect(input).toHaveValue(title)
  })
})
