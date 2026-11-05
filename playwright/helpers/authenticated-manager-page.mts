import { expect, type Page } from './test.mts'
import { MOBILE_VIEWPORTS } from 'vouchington-tooling/playwright'

function managerControl(page: Page, testId = 'manager-control') {
  return page.getByTestId(testId)
}

export async function assertManagerHeading(
  page: Page,
  testId: string,
  text: string,
): Promise<void> {
  await expect(managerControl(page, testId)).toContainText(text)
}

export async function assertSeededName(page: Page, testId: string, name: string): Promise<void> {
  await expect(managerControl(page, testId).filter({ hasText: name })).toBeVisible()
}

export async function assertExactValue(page: Page, testId: string, text: string): Promise<void> {
  await expect(managerControl(page, testId).first()).toHaveText(text)
}

export async function assertContainedValue(
  page: Page,
  testId: string,
  text: string,
): Promise<void> {
  await expect(managerControl(page, testId).first()).toContainText(text)
}

export async function assertManagerControlVisible(page: Page, testId: string): Promise<void> {
  await expect(managerControl(page, testId)).toBeVisible()
}

export async function assertFirstManagerControlVisible(page: Page, testId: string): Promise<void> {
  await expect(managerControl(page, testId).first()).toBeVisible()
}

export async function clickFirstManagerControl(page: Page, testId: string): Promise<void> {
  await managerControl(page, testId).first().click()
}

export async function clickManagerControl(page: Page, testId: string): Promise<void> {
  await managerControl(page, testId).click()
}

export async function clearManagerInputWithFill(page: Page, testId: string): Promise<void> {
  await managerControl(page, testId).fill('')
}

export async function clearManagerInputWithSelectAll(page: Page, testId: string): Promise<void> {
  const input = managerControl(page, testId)
  await input.press('ControlOrMeta+A')
  await input.press('Backspace')
}

export async function assertManagerErrorToast(page: Page, message: string): Promise<void> {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText(message)
}

export async function useIphoneSeViewport(page: Page): Promise<void> {
  await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
}
