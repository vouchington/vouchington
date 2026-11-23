import { createPlaywrightTimeoutGuard } from 'vouchington-tooling/playwright-config'

const guard = createPlaywrightTimeoutGuard({
  maxTimeoutMs: 30_000,
  fixtureName: 'vouchaTestTimeout',
})

export const playwrightTestTimeout = guard.testTimeout
export const validatePlaywrightConfigTimeouts = guard.validateConfigTimeouts
export const assertResolvedPlaywrightTimeouts = guard.assertResolvedTimeouts
export const protectPlaywrightHookTimeouts = guard.protectHookTimeouts
export const playwrightTimeoutFixture = guard.timeoutFixture
export const guardPlaywrightTestTimeouts = guard.guardTestTimeouts
