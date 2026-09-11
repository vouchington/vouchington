import type { BrowserContext, Page } from '@playwright/test'

export const PLAYWRIGHT_LOCAL_STORAGE_RESET_KEYS = [
  'aside-connect-social',
  'aside-follow-topics',
  'aside-upgrade-membership',
  'feed-style',
  'list-style',
  'theme',
] as const

export async function clearCookiesPreservingLocalStorage(context: BrowserContext): Promise<void> {
  await context.clearCookies()
}

export async function removeLocalStorageKeysBeforeNavigation(
  page: Page,
  keys: readonly string[] = PLAYWRIGHT_LOCAL_STORAGE_RESET_KEYS,
): Promise<void> {
  const storageKeys = [...new Set(keys)]
  await page.addInitScript(keysToRemove => {
    for (const key of keysToRemove) localStorage.removeItem(key)
  }, storageKeys)
}

export async function removeLocalStorageKeys(
  page: Page,
  keys: readonly string[] = PLAYWRIGHT_LOCAL_STORAGE_RESET_KEYS,
): Promise<void> {
  const storageKeys = [...new Set(keys)]
  await page.evaluate(keysToRemove => {
    for (const key of keysToRemove) localStorage.removeItem(key)
  }, storageKeys)
}

export async function resetAnonymousBrowserStateBeforeNavigation(
  page: Page,
  keys: readonly string[] = PLAYWRIGHT_LOCAL_STORAGE_RESET_KEYS,
): Promise<void> {
  await clearCookiesPreservingLocalStorage(page.context())
  await removeLocalStorageKeysBeforeNavigation(page, keys)
}
