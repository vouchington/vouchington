import { createPlaywrightTimeoutGuard } from 'vouchington-tooling/playwright-config'

// Keep banOverrides disabled until vouchington-tooling tolerates Playwright's internal
// `_setupArtifacts` call to `testInfo.setTimeout(testInfo.project.timeout)` (`playwright/lib/index.js:78`).
export const vouchaTimeoutGuard = createPlaywrightTimeoutGuard({
  maxTimeoutMs: 30_000,
  fixtureName: 'vouchaTestTimeout',
  banOverrides: false,
})

export const playwrightTestTimeout = vouchaTimeoutGuard.testTimeout
export const validatePlaywrightConfigTimeouts = vouchaTimeoutGuard.validateConfigTimeouts
export const assertResolvedPlaywrightTimeouts = vouchaTimeoutGuard.assertResolvedTimeouts
export const protectPlaywrightHookTimeouts = vouchaTimeoutGuard.protectHookTimeouts
export const playwrightTimeoutFixture = vouchaTimeoutGuard.timeoutFixture
export const guardPlaywrightTestTimeouts = vouchaTimeoutGuard.guardTestTimeouts
