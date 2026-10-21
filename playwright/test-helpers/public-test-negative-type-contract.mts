import type { test as canonicalTest } from '../helpers/test.mts'
import type {
  TestInfo,
  TestType,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
} from '@playwright/test'

// Compiler-only negative contracts; the normal Playwright tsconfig owns these checks.
export function verifyRejectedPlaywrightSkipTypes(subject: typeof canonicalTest): void {
  // @ts-expect-error no skip
  subject.skip('hidden', () => {})
  // @ts-expect-error no literal computed fixme
  subject['fixme'](true, 'hidden')
  subject.only('focused', async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no only-body skip
    info.skip(true, 'hidden')
  })
  subject.fail('expected failure', async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no fail-body skip
    info.skip(true, 'hidden')
  })
  subject.fail(
    'expected failure',
    { tag: '@probe' },
    async ({ browserName: _browserName }, info) => {
      // @ts-expect-error no fail-body fixme
      info.fixme(true, 'hidden')
    },
  )
  subject.fail.only('focused failure', async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no fail.only-body skip
    info.skip(true, 'hidden')
  })
  subject.fail.only(
    'focused failure',
    { tag: '@probe' },
    async ({ browserName: _browserName }, info) => {
      // @ts-expect-error no fail.only-body fixme
      info.fixme(true, 'hidden')
    },
  )
  // @ts-expect-error no suite skip
  subject.describe.skip('suite', () => {})
  // @ts-expect-error no serial fixme
  subject.describe.serial['fixme']('suite', () => {})
  subject.only('focused', { tag: '@probe' }, async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no only-body fixme
    info.fixme(true, 'hidden')
  })
  subject('body', async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no body skip
    info.skip(true, 'hidden')
    // @ts-expect-error no destructured fixme
    const { fixme } = info
    void fixme
    // @ts-expect-error no raw TestInfo widening
    const raw: TestInfo = info
    void raw
  })
  // @ts-expect-error no info skip
  subject.info().skip(true, 'hidden')
  subject.use({
    page: async ({ page }, use, info) => {
      // @ts-expect-error no use fixture skip
      info.skip(true, 'hidden')
      await use(page)
    },
  })
  const negativeExtended = subject.extend<{ custom: string }>({
    custom: async ({ browserName: _browserName }, use, info) => {
      // @ts-expect-error no fixture fixme
      info.fixme(true, 'hidden')
      await use('ok')
    },
  })
  // @ts-expect-error no extended skip
  negativeExtended.skip('hidden', () => {})
  // @ts-expect-error no twice extended fixme
  negativeExtended.extend<{ second: boolean }>({ second: true }).fixme('hidden', () => {})
  subject.beforeEach(async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no beforeEach skip
    info.skip(true, 'hidden')
  })
  subject.afterEach(async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no afterEach fixme
    info.fixme(true, 'hidden')
  })
  subject.beforeAll(async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no beforeAll skip
    info.skip(true, 'hidden')
  })
  subject.afterAll(async ({ browserName: _browserName }, info) => {
    // @ts-expect-error no afterAll fixme
    info.fixme(true, 'hidden')
  })
  subject.use({
    // @ts-expect-error explicit raw TestInfo fixture callback is incompatible
    page: async ({ page }, use, info: TestInfo) => {
      await use(page)
      void info
    },
  })
  // @ts-expect-error public test cannot be widened into unrestricted TestType
  const rawTest: TestType<
    PlaywrightTestArgs & PlaywrightTestOptions,
    PlaywrightWorkerArgs & PlaywrightWorkerOptions
  > = subject
  void rawTest
}
