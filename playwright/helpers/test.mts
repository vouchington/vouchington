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
} from 'vouchington-tooling/playwright-config'
import {
  createBrowserErrorsFixture,
  withMonitoredPage as withBrowserIssueMonitoring,
  type BrowserIssueMonitor,
} from 'vouchington-tooling/playwright'
import { monitorUiErrors, type ExpectedServerError } from './ui-error-monitor.mts'
import { browserTestOptions } from './browser-test-options.mts'
import { guardPlaywrightTestTimeouts, playwrightTestTimeout } from '../config/test-timeout.mts'

interface BrowserErrorFixtures {
  browserErrors: BrowserIssueMonitor
}

interface BrowserErrorFixtureArgs {
  context: BrowserContext
  vouchaTestTimeout?: void
}

interface UiErrorFixtures {
  allowErrorPage: string | undefined
  allowErrorToasts: string | undefined
  expectedServerErrors: ExpectedServerError[]
  uiErrors: void
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

export async function uiErrorsFixture(
  {
    context,
    allowErrorPage,
    allowErrorToasts,
    expectedServerErrors,
  }: Pick<UiErrorFixtures, 'allowErrorPage' | 'allowErrorToasts' | 'expectedServerErrors'> & {
    context: BrowserContext
  },
  run: () => Promise<void>,
  testInfo: TestInfo,
) {
  const monitor = await monitorUiErrors(context, {
    allowErrorPage,
    allowErrorToasts,
    expectedServerErrors,
  })
  await run()
  const failures = monitor.failures()
  if (failures.length > 0 && testInfo.status === 'passed') {
    throw new Error(`Unexpected app errors during the test:\n${failures.join('\n')}`)
  }
}

export const test = runnablePlaywrightTest(
  guardPlaywrightTestTimeouts(base).extend<BrowserErrorFixtures & UiErrorFixtures>({
    browserErrors: [browserErrorsFixture, { auto: true }],
    // Set via test.use() with a reason; each opts a spec out of one failure class on purpose.
    allowErrorPage: [undefined, { option: true }],
    allowErrorToasts: [undefined, { option: true }],
    expectedServerErrors: [[], { option: true }],
    uiErrors: [uiErrorsFixture, { auto: true }],
  }),
)

export { protectPlaywrightHookTimeouts } from '../config/test-timeout.mts'

export { expect }
export type { RunnablePlaywrightTestInfo as TestInfo } from 'vouchington-tooling/playwright-config'
export type { Browser, BrowserContext, Locator, Page, Request } from '@playwright/test'

export function withMonitoredPage<T>(
  browserOrContext: Browser | BrowserContext,
  testInfo: TestInfo,
  callback: (page: Page) => Promise<T>,
) {
  return withBrowserIssueMonitoring(browserOrContext, testInfo, callback, browserTestOptions)
}
