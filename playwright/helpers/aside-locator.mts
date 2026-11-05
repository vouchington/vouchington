import type { Locator, Page } from '@playwright/test'

export function getAsideLocator(page: Page, dataPw = 'aside'): Locator {
  return page.getByTestId(dataPw).first()
}
