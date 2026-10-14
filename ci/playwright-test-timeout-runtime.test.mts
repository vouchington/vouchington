import { describe, expect, it } from 'vitest'
import { guardPath, runFixture } from '../playwright/test-helpers/public-cap-fixture.mts'

const capError =
  /positive finite number at most 30,000 ms|slow modifiers are forbidden|timeout guard overrides are forbidden/

describe('Playwright public timeout runtime', () => {
  it.each([
    ['computed test setter', `test['set' + 'Timeout'](30001)`],
    ['zero test setter', 'test.setTimeout(0)'],
    ['infinite test setter', 'test.setTimeout(Infinity)'],
    ['info setter', 'info.setTimeout(30001)'],
    ['computed info setter', `info['set' + 'Timeout'](0)`],
    ['infinite info setter', 'info.setTimeout(Infinity)'],
    ['aliased test setter', 'const setter = test.setTimeout; setter(30001)'],
    ['bound info setter', 'const setter = info.setTimeout.bind(info); setter(30001)'],
    ['replacement test setter', 'test.setTimeout = () => {}; test.setTimeout(30001)'],
    ['replacement slow', 'test.slow = () => {}; test.slow()'],
    ['test.info instance', 'test.info().setTimeout(30001)'],
    ['test slow', 'test.slow()'],
    ['computed test slow', `test['sl' + 'ow']()`],
    ['info slow', 'info.slow()'],
    ['aliased info slow', 'const slow = info.slow.bind(info); slow()'],
    ['replacement info setter', 'info.setTimeout = () => {}; info.setTimeout(30001)'],
  ])('rejects %s before continuing the body', async (name, body) => {
    const result = await runFixture(body)
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(
      name.startsWith('replacement') ? /read only|Cannot assign/ : capError,
    )
    expect(result.marker).toBeUndefined()
  })

  it.each([
    ['setter', 'info.setTimeout(30001)'],
    ['slow', 'info.slow()'],
    ['aliased setter', 'const setter = info.setTimeout.bind(info); setter(0)'],
  ])('installs the info guard before beforeEach %s', async (_name, hook) => {
    const result = await runFixture('', {
      collection: `test.beforeEach(async ({}, info) => { ${hook} })`,
    })
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.marker).toBeUndefined()
  })

  it.each([
    ['descendant setter', `const child = test.extend({}); child.setTimeout(30001)`],
    ['descendant slow', `const child = test.extend({}); child.slow()`],
    ['suite setter', `const configure = test.describe.configure; configure({ timeout: 30001 })`],
    ['collection slow', 'test.slow()'],
    ['extend guard replacement', 'test.extend({ vouchaTestTimeout: undefined })'],
    ['use guard replacement', 'test.use({ vouchaTestTimeout: undefined })'],
    [
      'test fixture tuple ceiling',
      `test.extend({ sample: [async ({}, use) => await use('fixture'), { timeout: 30001 }] })`,
    ],
    [
      'worker fixture tuple ceiling',
      `test.extend({ sample: [async ({}, use) => await use('fixture'), { scope: 'worker', timeout: 30001 }] })`,
    ],
    [
      'computed fixture tuple ceiling',
      `const budget = 30000 + 1; const options = { ['time' + 'out']: budget }; test.extend({ sample: [async ({}, use) => await use('fixture'), options] })`,
    ],
    [
      'zero fixture tuple deadline',
      `test.extend({ sample: [async ({}, use) => await use('fixture'), { timeout: 0 }] })`,
    ],
    [
      'infinite fixture tuple deadline',
      `test.extend({ sample: [async ({}, use) => await use('fixture'), { timeout: Infinity }] })`,
    ],
    [
      'use fixture tuple ceiling',
      `test.use({ sample: [async ({}, use) => await use('fixture'), { timeout: 30001 }] })`,
    ],
  ])('rejects %s during collection', async (_name, collection) => {
    const result = await runFixture('', { collection })
    expect(result.code).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.marker).toBeUndefined()
  })

  it.each([
    ['test', 30_000],
    ['worker', 30_000],
    ['test', undefined],
    ['worker', undefined],
  ] as const)('preserves legal %s fixture tuple timeout %s', async (scope, timeout) => {
    const result = await runFixture('', {
      collection: `
        const options = { scope: ${JSON.stringify(scope)}, timeout: ${String(timeout)} }
        const child = test.extend({ sample: [async ({}, use) => await use('fixture'), options] })
        child('legal tuple fixture', async ({ sample }) => {
          if (sample !== 'fixture') throw new Error('fixture value lost')
        })`,
    })
    expect(result.code).toBe(0)
    expect(result.stats).toMatchObject({ expected: 2, unexpected: 0 })
    expect(result.marker).toBe('continued')
  })

  it.each(['30000', 'undefined'])(
    'forwards a captured accessor timeout %s without re-reading or mutating input',
    async initial => {
      const result = await runFixture('', {
        collection: `
          let reads = 0
          let scopeReads = 0
          let original
          const options = Object.freeze({
            get timeout() { reads++; return reads === 1 ? ${initial} : 30001 },
            get scope() { if (this !== original) throw new Error('receiver changed'); scopeReads++; return 'test' }
          })
          original = options
          const tuple = Object.freeze([async ({}, use) => await use('fixture'), options])
          const child = test.extend({ sample: tuple })
          child('captured accessor fixture', async ({ sample }) => {
            if (reads !== 1 || scopeReads < 1) throw new Error('options read incorrectly')
            if (sample !== 'fixture' || tuple[1] !== options || !Object.isFrozen(options)) throw new Error('input changed')
          })`,
      })
      expect(result.code).toBe(0)
      expect(result.stats).toMatchObject({ expected: 2, unexpected: 0 })
      expect(result.marker).toBe('continued')
    },
  )

  it('preserves shared fixture identity through native mergeTests', async () => {
    const result = await runFixture('', {
      collection: `
        const { mergeTests } = await import('@playwright/test')
        let overrides = 0
        const base = test.extend({ sample: async ({}, use) => await use('base') })
        const shared = { data: NaN, sample: async ({ sample }, use) => { overrides++; await use(sample + '/child') } }
        const combined = mergeTests(base.extend(shared), base.extend(shared))
        combined('shared override', async ({ sample, data }) => {
          if (!Number.isNaN(data) || sample !== 'base/child' || overrides !== 1) throw new Error('shared fixture duplicated')
        })`,
    })
    expect(result.code).toBe(0)
    expect(result.stats).toMatchObject({ expected: 2, unexpected: 0 })
    expect(result.marker).toBe('continued')
  })

  it('rejects changed fixture input instead of trusting a stale shared snapshot', async () => {
    const result = await runFixture('', {
      collection: `
        const shared = { sample: [async ({}, use) => await use('fixture'), { timeout: 30000 }] }
        test.extend(shared)
        shared.sample[1].timeout = 30001
        test.extend(shared)`,
    })
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/RangeError/)
    expect(result.marker).toBeUndefined()
  })

  it.each(['30000', 'undefined'])(
    'captures configure accessor timeout %s at the real test slot',
    async initial => {
      const result = await runFixture(
        `
      if (reads !== 1 || info.timeout !== 30000) throw new Error('suite deadline not captured')`,
        {
          collection: `
        let reads = 0
        const options = Object.freeze({ get timeout() { reads++; return reads === 1 ? ${initial} : 30001 } })
        test.describe.configure(options)`,
        },
      )
      expect(result.code).toBe(0)
      expect(result.stats).toMatchObject({ expected: 1, unexpected: 0 })
      expect(result.marker).toBe('continued')
    },
  )

  it.each(['0', 'Infinity', '30001'])(
    'rejects resolved CLI timeout %s before body',
    async cliTimeout => {
      const result = await runFixture('', { cliTimeout })
      expect(result.code).toBe(1)
      expect(result.output).toMatch(/positive finite number at most 30,000 ms|timeout.*number/i)
      expect(result.marker).toBeUndefined()
    },
  )

  it.each([
    ['extended computed setter', `test['set' + 'Timeout'](30001)`],
    ['extended info setter', 'info.setTimeout(30001)'],
    ['extended slow', 'test.slow()'],
  ])('rejects %s in an inherited automatic fixture', async (_name, body) => {
    const result = await runFixture(body, { extended: true })
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.marker).toBeUndefined()
  })

  it.each([
    ['beforeAll', 'info.setTimeout(30001)'],
    ['afterAll', 'info.setTimeout(30001)'],
    ['beforeAll', 'info.slow()'],
    ['afterAll', 'info.slow()'],
  ] as const)('rejects %s %s before continuing the hook', async (hook, action) => {
    const result = await runFixture('', {
      collection: `test[${JSON.stringify(hook)}]('owned cap hook', async ({}, info) => {
          protectPlaywrightHookTimeouts(info)
          ${action}
          writeFileSync('hook.marker', 'continued')
        })`,
    })
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.hookMarker).toBeUndefined()
  })

  it('preserves named all-hook fixtures, ordering and legal hook deadlines', async () => {
    const result = await runFixture('', {
      extended: true,
      workerFixture: true,
      collection: `
        const seen = []
        test.beforeAll('owned setup', async ({ sample }, info) => {
          protectPlaywrightHookTimeouts(info)
          if (sample !== 'fixture') throw new Error('worker fixture lost')
          info.setTimeout(25000)
          seen.push('before')
        })
        test.afterAll('owned teardown', async ({ sample }, info) => {
          protectPlaywrightHookTimeouts(info)
          if (sample !== 'fixture' || seen.join() !== 'before') throw new Error('hook context lost')
          info.setTimeout(30000)
          writeFileSync('hook.marker', 'completed')
        })`,
    })
    expect(result.code).toBe(0)
    expect(result.stats).toMatchObject({ expected: 1, unexpected: 0 })
    expect(result.hookMarker).toBe('completed')
  })

  it.each(['beforeAll', 'afterAll'] as const)(
    'reports the original %s declaration on an actual hook timeout',
    async phase => {
      const result = await runFixture('', {
        collection: `test[${JSON.stringify(phase)}]('owned timeout location', async ({}, info) => {
            protectPlaywrightHookTimeouts(info)
            info.setTimeout(25)
            await new Promise(() => {})
          })`,
      })
      expect(result.code).toBe(1)
      expect(result.stats?.unexpected).toBe(1)
      const failure = result.errors.find(error => error.location?.file.endsWith('tiny.spec.mts'))
      expect(failure?.location?.file).toMatch(/tiny\.spec\.mts$/)
      expect(failure?.location?.file).not.toBe(guardPath)
      const declaration =
        result.specSource
          .split('\n')
          .findIndex(line => line.includes(`]('owned timeout location', async`)) + 1
      expect(declaration).toBeGreaterThan(0)
      expect(failure?.location?.line).toBe(declaration)
      expect(result.output).toMatch(/hook timeout.*exceeded/i)
      expect(result.output).toContain('owned timeout location')
      expect(result.output).toContain('protectPlaywrightHookTimeouts(info)')
    },
  )

  it('runs legal public setters and extended fixtures at the CLI ceiling', async () => {
    const result = await runFixture(
      `
    test.setTimeout(30000)
    const setter = info.setTimeout.bind(info)
    setter(25000)
    if (sample !== 'fixture') throw new Error('extended fixture lost')
    if (test.info() !== info) throw new Error('different public info instance')
  `,
      { cliTimeout: '30000', extended: true },
    )
    expect(result.code).toBe(0)
    expect(result.marker).toBe('continued')
    expect(result.stats).toMatchObject({ expected: 1, unexpected: 0 })
  })
})
