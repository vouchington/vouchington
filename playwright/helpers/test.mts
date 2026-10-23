import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  runnablePlaywrightTest,
  type RunnablePlaywrightTestInfo as TestInfo,
} from '../config/public-test-contract.mts'
import {
  createBrowserErrorsFixture,
  withMonitoredPage as withBrowserIssueMonitoring,
  type BrowserIssueMonitor,
} from 'vouchington-tooling/playwright'
import { browserTestOptions } from './browser-test-options.mts'
import { guardPlaywrightTestTimeouts, playwrightTestTimeout } from '../config/test-timeout.mts'

interface BrowserErrorFixtures {
  browserErrors: BrowserIssueMonitor
}

interface BrowserErrorFixtureArgs {
  context: BrowserContext
  vouchaTestTimeout?: void
}

const monitorBrowserErrors = createBrowserErrorsFixture({
  ...browserTestOptions,
  assertTimeout: playwrightTestTimeout,
})

export async function browserErrorsFixture(
  { context, vouchaTestTimeout: _timeoutGuard }: BrowserErrorFixtureArgs,
  run: (monitor: BrowserIssueMonitor) => Promise<void>,
  testInfo: TestInfo,
) {
  await monitorBrowserErrors({ context }, run, testInfo)
}

export const test = runnablePlaywrightTest(
  guardPlaywrightTestTimeouts(base).extend<BrowserErrorFixtures>({
    browserErrors: [browserErrorsFixture, { auto: true }],
  }),
)

export { protectPlaywrightHookTimeouts } from '../config/test-timeout.mts'

export { expect }
export type { RunnablePlaywrightTestInfo as TestInfo } from '../config/public-test-contract.mts'
export type { Browser, BrowserContext, Locator, Page, Request } from '@playwright/test'

export function withMonitoredPage<T>(
  browserOrContext: Browser | BrowserContext,
  testInfo: TestInfo,
  callback: (page: Page) => Promise<T>,
) {
  return withBrowserIssueMonitoring(browserOrContext, testInfo, callback, browserTestOptions)
}
