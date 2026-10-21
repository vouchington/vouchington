import type { test as canonicalTest } from '../helpers/test.mts'
import type { TestType } from '@playwright/test'
import type {
  RunnableCalls,
  RunnablePlaywrightTest,
  RunnablePlaywrightFixtures,
} from '../config/public-test-contract.mts'

// Compiler-only contracts: the normal Playwright tsconfig checks these functions; no runner calls
// them. Keep both positive APIs and negative directives so removing a restriction fails TSC.
export function verifyPublicPlaywrightContract(subject: typeof canonicalTest): void {
  const extended = subject.extend<{ custom: string }, { workerCustom: number }>({
    custom: async ({ page }, use) => {
      await page.title()
      await use('ok')
    },
    workerCustom: [3, { scope: 'worker' }],
  })
  extended.extend({
    custom: [
      async ({ custom, workerCustom }, use, info) => {
        const title: string = info.title
        const workerValue: number = workerCustom
        await info.attach('contract', { body: title, contentType: 'text/plain' })
        info.annotations.push({ type: 'contract', description: title })
        const output: string = info.outputPath('contract.txt')
        const retry: number = info.retry
        void workerValue
        void output
        void retry
        await use(custom)
      },
      { scope: 'test', timeout: 1_000, title: 'existing test fixture', box: 'self' },
    ],
    workerCustom: [
      async ({ workerCustom }, use, workerInfo) => {
        const index: number = workerInfo.workerIndex
        void index
        await use(workerCustom)
      },
      { scope: 'worker', timeout: 1_000, title: 'existing worker fixture', box: true },
    ],
  })
  extended.extend<{ optionFixture: string }, { workerOption: number }>({
    optionFixture: [
      'default',
      { option: true, auto: false, scope: 'test', title: 'test option', box: true, timeout: 1_000 },
    ],
    workerOption: [
      1,
      {
        option: true,
        auto: false,
        scope: 'worker',
        title: 'worker option',
        box: 'self',
        timeout: 1_000,
      },
    ],
  })
  extended('positive', async ({ page, custom, workerCustom }) => {
    const s: string = custom
    const n: number = workerCustom
    await page.title()
    void s
    void n
  })
  extended('details', { tag: '@probe' }, async ({ custom }) => {
    const s: string = custom
    void s
  })
  extended.describe('suite', () => {})
  extended.describe(() => {})
  extended.describe('suite', { tag: '@probe' }, () => {})
  extended.describe.serial('serial', () => {})
  extended.describe.parallel('parallel', () => {})
  const twice = extended.extend<{ second: boolean }>({ second: true })
  twice('twice', async ({ custom, second, workerCustom }) => {
    const s: string = custom
    const b: boolean = second
    const n: number = workerCustom
    void s
    void b
    void n
  })

  subject.beforeEach(async ({ page }, info) => {
    await page.title()
    const title: string = info.title
    void title
  })
  subject.afterAll('cleanup', async ({ browserName }, info) => {
    const name: string = browserName
    const title: string = info.title
    void name
    void title
  })
  subject.extend({
    page: async ({ page }, use, info) => {
      const title: string = info.title
      await use(page)
      void title
    },
  })

  subject.only('focused', async ({ page }, info) => {
    await page.title()
    const title: string = info.title
    void title
  })
  subject.only('focused', { tag: '@probe' }, async ({ browserName: _browserName }, info) => {
    const title: string = info.title
    void title
  })
  subject.fail('expected failure', async ({ page }, info) => {
    await page.title()
    const title: string = info.title
    void title
  })
  subject.fail('expected failure', { tag: '@probe' }, async ({ page }, info) => {
    await page.title()
    const title: string = info.title
    void title
  })
  subject.fail(true, 'expected failure')
  subject.fail(({ browserName }) => browserName === 'chromium', 'conditional failure')
  subject.fail()
  subject.fail.only('focused failure', async ({ page }, info) => {
    await page.title()
    const title: string = info.title
    void title
  })
  subject.fail.only('focused failure', { tag: '@probe' }, async ({ page }, info) => {
    await page.title()
    const title: string = info.title
    void title
  })
  subject.describe.only('suite', () => {})
  subject.describe.only(() => {})
  subject.describe.only('suite', { tag: '@probe' }, () => {})
  subject.describe.serial.only('suite', () => {})
  subject.describe.parallel.only('suite', () => {})

  subject.use({
    page: async ({ page }, use, info) => {
      const title: string = info.title
      await use(page)
      void title
    },
  })
  void subject.step.skip('step remains available', async () => {})
  void subject.step('step Info remains available', async step => {
    step.skip(true, 'step only')
  })
}

export function verifyPlaywrightMembers<T extends {}, W extends {}>(source: TestType<T, W>) {
  const only: RunnablePlaywrightTest<T, W>['only'] = source.only
  const fail: RunnablePlaywrightTest<T, W>['fail'] = source.fail
  const use: RunnablePlaywrightTest<T, W>['use'] = source.use
  const info: RunnablePlaywrightTest<T, W>['info'] = source.info
  const beforeEach: RunnablePlaywrightTest<T, W>['beforeEach'] = source.beforeEach
  const afterEach: RunnablePlaywrightTest<T, W>['afterEach'] = source.afterEach
  const beforeAll: RunnablePlaywrightTest<T, W>['beforeAll'] = source.beforeAll
  const afterAll: RunnablePlaywrightTest<T, W>['afterAll'] = source.afterAll
  const describe: RunnablePlaywrightTest<T, W>['describe'] = source.describe
  const calls: RunnableCalls<TestType<T, W>> = source
  return { only, fail, use, info, beforeEach, afterEach, beforeAll, afterAll, describe, calls }
}
export function verifyPlaywrightExtension<T extends {}, W extends {}, A extends {}, B extends {}>(
  source: TestType<T, W>,
  fixtures: RunnablePlaywrightFixtures<A, B, T, W>,
) {
  const next = source.extend<A, B>(fixtures)
  const checked: RunnableCalls<TestType<T & A, W & B>> &
    Omit<RunnablePlaywrightTest<T & A, W & B>, 'extend'> = next
  return checked
}
