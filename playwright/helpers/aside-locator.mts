import type { Locator, Page } from '@playwright/test'

export function getAsideLocator(page: Page, dataPw: string): Locator {
  // oxlint-disable-next-line no-mistakes/playwright-literals -- each spec passes this aside's id
  return page.getByTestId(dataPw).first()
}
