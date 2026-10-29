import { expect, type Locator, type Page } from './test.mts'
import { scrollToLoadMore } from 'vouchington-tooling/playwright'

/** Pages a staff queue forward until the fixture-owned item is in the DOM. */
export async function revealOwnedQueueItem(
  page: Page,
  item: Locator,
  endpoint: string,
): Promise<void> {
  await expect
    .poll(async () => {
      if (await item.count()) return true
      await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()
      const nextPage = page.waitForResponse(response => {
        const url = new URL(response.url())
        return url.pathname === endpoint && url.searchParams.has('after') && response.ok()
      })
      await scrollToLoadMore(page)
      await nextPage
      return (await item.count()) > 0
    })
    .toBe(true)
  await item.scrollIntoViewIfNeeded()
}
