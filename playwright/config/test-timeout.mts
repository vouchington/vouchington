import type {
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
  test as PlaywrightBase,
} from '@playwright/test'
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
// The package types its fixture name as a string; Voucha's name is fixed, so type it exactly.
export const guardPlaywrightTestTimeouts: (
  base: typeof PlaywrightBase,
) => TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & { vouchaTestTimeout: void },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> = guard.guardTestTimeouts as never
