import { snapshotFixtureTimeouts, snapshotOptionsTimeout } from './fixture-timeout.mts'
import type {
  FullConfig,
  PlaywrightTestConfig,
  TestInfo,
  TestType,
  test as PlaywrightBase,
} from '@playwright/test'

const MAX_PLAYWRIGHT_TEST_TIMEOUT_MS = 30_000

export function playwrightTestTimeout(timeout: number, label: string): number {
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > MAX_PLAYWRIGHT_TEST_TIMEOUT_MS) {
    throw new RangeError(`${label} must be a positive finite number at most 30,000 ms`)
  }
  return timeout
}

export function validatePlaywrightConfigTimeouts(
  config: PlaywrightTestConfig,
): PlaywrightTestConfig {
  if (config.timeout !== undefined) playwrightTestTimeout(config.timeout, 'Playwright test timeout')
  for (const project of config.projects ?? []) {
    if (project.timeout !== undefined) {
      playwrightTestTimeout(project.timeout, `Playwright project ${project.name} timeout`)
    }
  }
  return config
}

export function assertResolvedPlaywrightTimeouts(config: Pick<FullConfig, 'projects'>): void {
  for (const project of config.projects) {
    playwrightTestTimeout(project.timeout, `Playwright project ${project.name} effective timeout`)
  }
}

function rejectSlow(): never {
  throw new RangeError('Playwright slow modifiers are forbidden by the 30,000 ms test cap')
}

type TimeoutInfo = Pick<TestInfo, 'timeout' | 'setTimeout' | 'slow'>

const protectedInfo = new WeakSet<TimeoutInfo>()

export function protectPlaywrightHookTimeouts(info: TimeoutInfo): void {
  if (protectedInfo.has(info)) return
  playwrightTestTimeout(info.timeout, 'Playwright effective test timeout')
  const setTimeout = Reflect.get(info, 'setTimeout') as TestInfo['setTimeout']
  Object.defineProperties(info, {
    setTimeout: {
      writable: false,
      configurable: false,
      value: (timeout: number) =>
        Reflect.apply(setTimeout, info, [
          playwrightTestTimeout(timeout, 'Playwright runtime test timeout'),
        ]),
    },
    slow: { value: rejectSlow, writable: false, configurable: false },
  })
  protectedInfo.add(info)
}

export async function playwrightTimeoutFixture(
  // oxlint-disable-next-line no-empty-pattern -- Playwright parses this public fixture dependency list.
  {}: object,
  use: () => Promise<void>,
  info: TestInfo,
): Promise<void> {
  protectPlaywrightHookTimeouts(info)
  await use()
}

export function guardPlaywrightTestTimeouts(base: typeof PlaywrightBase) {
  const guarded = base.extend<{ vouchaTestTimeout: void }>({
    vouchaTestTimeout: [playwrightTimeoutFixture, { auto: true }],
  })
  return protectPublicMethods(guarded)
}

function protectPublicMethods<T extends object, W extends object>(test: TestType<T, W>) {
  const setTimeout = Reflect.get(test, 'setTimeout') as TestType<T, W>['setTimeout']
  const extend = test.extend
  const use = test.use
  const configure = Reflect.get(test.describe, 'configure') as TestType<
    T,
    W
  >['describe']['configure']
  Object.defineProperties(test, {
    beforeAll: { value: test.beforeAll, writable: false, configurable: false },
    afterAll: { value: test.afterAll, writable: false, configurable: false },
    info: { value: test.info, writable: false, configurable: false },
    setTimeout: {
      writable: false,
      configurable: false,
      value: (timeout: number) =>
        Reflect.apply(setTimeout, test, [
          playwrightTestTimeout(timeout, 'Playwright public test timeout'),
        ]),
    },
    slow: { value: rejectSlow, writable: false, configurable: false },
    use: {
      writable: false,
      configurable: false,
      value: (fixtures: Parameters<typeof use>[0]) => {
        return Reflect.apply(use, test, [snapshotFixtureTimeouts(fixtures, playwrightTestTimeout)])
      },
    },
    extend: {
      writable: false,
      configurable: false,
      value: (fixtures: Parameters<typeof extend>[0]) => {
        return protectPublicMethods(
          Reflect.apply(extend, test, [
            snapshotFixtureTimeouts(fixtures, playwrightTestTimeout),
          ]) as ReturnType<typeof extend>,
        )
      },
    },
  })
  Object.defineProperty(test.describe, 'configure', {
    writable: false,
    configurable: false,
    value: (options: Parameters<typeof configure>[0]) => {
      return Reflect.apply(configure, test.describe, [
        snapshotOptionsTimeout(options, playwrightTestTimeout, 'Playwright suite test timeout'),
      ])
    },
  })
  return test
}
