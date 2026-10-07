import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { BrowserIssueMonitor } from './browser-errors.mts'
import {
  BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST,
  installBlockedExternalNetwork,
} from './blocked-external-network.mts'
import { guardPlaywrightTestTimeouts, playwrightTestTimeout } from '../config/test-timeout.mts'

interface BrowserErrorFixtures {
  browserErrors: BrowserIssueMonitor
}

interface BrowserErrorFixtureArgs {
  context: BrowserContext
  vouchaTestTimeout?: void
}

export async function browserErrorsFixture(
  { context, vouchaTestTimeout: _timeoutGuard }: BrowserErrorFixtureArgs,
  run: (monitor: BrowserIssueMonitor) => Promise<void>,
  testInfo: TestInfo,
) {
  playwrightTestTimeout(testInfo.timeout, 'Playwright effective test timeout')
  const monitor = new BrowserIssueMonitor(testInfo, {
    allowlist: BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST,
  })

  await installBlockedExternalNetwork(context)
  monitor.monitorContext(context)

  try {
    try {
      await run(monitor)
    } catch (err) {
      await monitor.attachIssuesIfAny()
      throw err
    }

    if (testInfo.status === testInfo.expectedStatus) {
      await monitor.assertNoIssues()
    } else {
      await monitor.attachIssuesIfAny()
    }
  } finally {
    monitor.dispose()
  }
}

export const test = guardPlaywrightTestTimeouts(base).extend<BrowserErrorFixtures>({
  browserErrors: [browserErrorsFixture, { auto: true }],
})

export { expect }
export type { Browser, BrowserContext, Locator, Page, Request, TestInfo } from '@playwright/test'

export async function withMonitoredPage<T>(
  browserOrContext: Browser | BrowserContext,
  testInfo: TestInfo,
  callback: (page: Page) => Promise<T>,
) {
  const page = await browserOrContext.newPage()
  const monitor = new BrowserIssueMonitor(testInfo, {
    allowlist: BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST,
  })

  try {
    await installBlockedExternalNetwork(page.context())
    monitor.monitorContext(page.context())

    let result: T
    try {
      result = await callback(page)
    } catch (err) {
      await monitor.attachIssuesIfAny()
      throw err
    }

    await monitor.assertNoIssues()
    return result
  } finally {
    monitor.dispose()
    await page.close().catch(() => {})
  }
}
