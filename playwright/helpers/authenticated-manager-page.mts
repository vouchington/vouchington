/* oxlint-disable no-mistakes/playwright-literals -- configured selector wrappers forward literal test ids from each spec */
import { expect, type Page } from './test.mts'
import { MOBILE_VIEWPORTS } from './viewport-constants.mts'

export async function assertManagerHeading(
  page: Page,
  testId: string,
  text: string,
): Promise<void> {
  await expect(page.getByTestId(testId)).toContainText(text)
}

export async function assertSeededName(page: Page, testId: string, name: string): Promise<void> {
  await expect(page.getByTestId(testId).filter({ hasText: name })).toBeVisible()
}

export async function assertExactValue(page: Page, testId: string, text: string): Promise<void> {
  await expect(page.getByTestId(testId).first()).toHaveText(text)
}

export async function assertContainedValue(
  page: Page,
  testId: string,
  text: string,
): Promise<void> {
  await expect(page.getByTestId(testId).first()).toContainText(text)
}

export async function assertManagerControlVisible(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible()
}

export async function assertFirstManagerControlVisible(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId).first()).toBeVisible()
}

export async function clickFirstManagerControl(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).first().click()
}

export async function clickManagerControl(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).click()
}

export async function clearManagerInputWithFill(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).fill('')
}

export async function clearManagerInputWithSelectAll(page: Page, testId: string): Promise<void> {
  const input = page.getByTestId(testId)
  await input.press('ControlOrMeta+A')
  await input.press('Backspace')
}

export async function assertManagerErrorToast(page: Page, message: string): Promise<void> {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText(message)
}

export async function useIphoneSeViewport(page: Page): Promise<void> {
  await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
}
