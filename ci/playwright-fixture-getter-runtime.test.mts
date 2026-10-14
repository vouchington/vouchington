import { describe, expect, it } from 'vitest'
import { runFixture } from '../playwright/test-helpers/public-cap-fixture.mts'

describe('Playwright deferred fixture definitions', () => {
  it.each([
    ['extend', false],
    ['extend', true],
    ['use', false],
    ['use', true],
  ] as const)(
    'preserves native %s getter values and counts with frozen=%s',
    async (method, frozen) => {
      const run = (native: boolean) =>
        runFixture('', {
          collection: `
        let phase = 'early'
        let reads = 0
        const fixtures = Object.defineProperty({}, 'sample', {
          enumerable: true,
          get() {
            if (this !== fixtures) throw new Error('fixture receiver changed')
            reads++
            return phase === 'early' ? 'stale' : 'fresh'
          }
        })
        ${frozen ? 'Object.freeze(fixtures)' : ''}
        const base = ${native ? 'raw' : 'test'}
        const child = ${method === 'extend' ? 'base.extend(fixtures)' : "base.extend({ sample: 'default' })"}
        ${method === 'use' ? 'child.use(fixtures)' : ''}
        if (reads !== 0) throw new Error('fixture accessed during registration')
        child('deferred fixture', async ({ sample }) => {
          if (sample !== 'fresh') throw new Error('late fixture value lost')
          writeFileSync('hook.marker', JSON.stringify({ sample, reads }))
        })
        phase = 'late'`,
        })
      const native = await run(true)
      const guarded = await run(false)
      for (const result of [native, guarded]) {
        expect(result.code).toBe(0)
        expect(result.stats).toMatchObject({ expected: 2, unexpected: 0 })
        expect(result.marker).toBe('continued')
      }
      expect(JSON.parse(guarded.hookMarker ?? '{}')).toEqual(JSON.parse(native.hookMarker ?? '{}'))
      expect(JSON.parse(guarded.hookMarker ?? '{}')).toMatchObject({
        sample: 'fresh',
        reads: expect.any(Number),
      })
    },
  )

  it.each([
    ['extend', 30000],
    ['extend', 30001],
    ['use', 30000],
    ['use', 30001],
  ] as const)('validates the deferred %s tuple deadline %s', async (method, timeout) => {
    const result = await runFixture('', {
      collection: `
        let ready = false
        const fixtures = Object.freeze(Object.defineProperty({}, 'sample', {
          enumerable: true,
          get() {
            if (!ready) throw new Error('tuple accessed during registration')
            return [async ({}, use) => await use('late tuple'), { timeout: ${timeout} }]
          }
        }))
        const child = ${method === 'extend' ? 'test.extend(fixtures)' : "test.extend({ sample: 'default' })"}
        ${method === 'use' ? 'child.use(fixtures)' : ''}
        child('deferred tuple', async ({ sample }) => {
          if (sample !== 'late tuple') throw new Error('late tuple value lost')
        })
        ready = true`,
    })
    const tooLarge = timeout > 30000
    expect(result).toMatchObject(
      tooLarge
        ? { code: 1, marker: undefined }
        : { code: 0, stats: { expected: 2, unexpected: 0 }, marker: 'continued' },
    )
    expect(result.output).toMatch(
      tooLarge ? /positive finite number at most 30,000 ms/ : /deferred tuple/,
    )
  })
})
