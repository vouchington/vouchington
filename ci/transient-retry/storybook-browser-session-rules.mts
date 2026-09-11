import {
  hasStorybookBrowserViteReady,
  storybookBrowserAttemptMarker,
  stripAnsi,
} from './storybook-shared.mts'
const storybookBrowserSessionTimeoutMarker = 'Failed to connect to the browser session'

const terminalStorybookBrowserSessionAttempt = (plainLog: string): string => {
  const timeoutIndex = plainLog.lastIndexOf(storybookBrowserSessionTimeoutMarker)
  if (timeoutIndex === -1) return ''

  const attemptIndex = plainLog.lastIndexOf(storybookBrowserAttemptMarker, timeoutIndex)
  return plainLog.slice(attemptIndex === -1 ? timeoutIndex : attemptIndex)
}

export const hasStorybookBrowserSessionConnectionTimeout = (log: string): boolean => {
  const plainLog = stripAnsi(log)
  const sessionAttempt = terminalStorybookBrowserSessionAttempt(plainLog)
  return (
    plainLog.includes('VITEST_STORYBOOK_BROWSER: 1') &&
    hasStorybookBrowserViteReady(sessionAttempt) &&
    sessionAttempt.includes(storybookBrowserSessionTimeoutMarker) &&
    sessionAttempt.includes('[web-storybook-browser (chromium)] within the timeout') &&
    /Tests\s+no tests/.test(sessionAttempt) &&
    !sessionAttempt.includes('|web-storybook-browser')
  )
}
