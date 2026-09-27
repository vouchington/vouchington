import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Seeded topic IDs from playwright-test-data.mts
const CARD_TOPIC = {
  id: '019c64e6-f710-74cb-b36d-130af8ff1067',
}

test.describe('Topic Detail Sub-Tabs', () => {
  test('reviews tab', async ({ page }) => {
    await navigateTo(page, `/card/${CARD_TOPIC.id}/reviews`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('data-points tab', async ({ page }) => {
    await navigateTo(page, `/card/${CARD_TOPIC.id}/data-points`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('news tab', async ({ page }) => {
    await navigateTo(page, `/card/${CARD_TOPIC.id}/news`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
