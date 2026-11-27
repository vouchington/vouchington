import { createPlaywrightTimeoutGuard } from 'vouchington-tooling/playwright-config'

export const vouchaTimeoutGuard = createPlaywrightTimeoutGuard({
  maxTimeoutMs: 30_000,
  fixtureName: 'vouchaTestTimeout',
  banOverrides: true,
})

export const playwrightTestTimeout = vouchaTimeoutGuard.testTimeout
export const validatePlaywrightConfigTimeouts = vouchaTimeoutGuard.validateConfigTimeouts
export const assertResolvedPlaywrightTimeouts = vouchaTimeoutGuard.assertResolvedTimeouts
export const protectPlaywrightHookTimeouts = vouchaTimeoutGuard.protectHookTimeouts
export const playwrightTimeoutFixture = vouchaTimeoutGuard.timeoutFixture
export const guardPlaywrightTestTimeouts = vouchaTimeoutGuard.guardTestTimeouts
