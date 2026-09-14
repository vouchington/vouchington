import type { Browser, BrowserContext, Page } from 'playwright-core'
import onError from '@modules/on-error'

export type BrowserSession = {
  browser: Browser
  context: BrowserContext
  page: Page
}

export async function openBrowserSession(
  connect: (wsEndpoint: string) => Promise<Browser>,
  wsEndpoint: string,
): Promise<BrowserSession> {
  const browser = await connect(wsEndpoint)
  try {
    const opened = await openBrowserContext(browser)
    return { browser, ...opened }
  } catch (error) {
    await browser.close().catch(onError)
    throw error
  }
}

async function openBrowserContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    return { context, page }
  } catch (error) {
    await context.close().catch(onError)
    throw error
  }
}
