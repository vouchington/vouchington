import type { Locator, Page } from '@playwright/test'

export function getAsideLocator(page: Page, dataPw: string): Locator {
  // oxlint-disable-next-line no-mistakes/playwright-literals -- configured selector wrapper forwards the literal argument from each spec
  return page.getByTestId(dataPw).first()
}
