import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import onError from '@modules/on-error'

export type BrowserSession = {
  browser: Browser
  context: BrowserContext
  page: Page
}

export async function openBrowserSession(wsEndpoint: string): Promise<BrowserSession> {
  const browser = await chromium.connectOverCDP(wsEndpoint)
  try {
    const opened = await openBrowserContext(browser)
    return { browser, ...opened }
  } catch (err) {
    await browser.close().catch(onError)
    throw err
  }
}

async function openBrowserContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    return { context, page }
  } catch (err) {
    await context.close().catch(onError)
    throw err
  }
}
