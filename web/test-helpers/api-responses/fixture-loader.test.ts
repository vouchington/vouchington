import { describe, expect, it } from 'vitest'
import manifest from '../../../api-fixtures/v1/manifest.json'
import { WEB_API_FIXTURE_DECLARATIONS, indexWebApiFixtureDeclarations } from './declarations'
import { defineWebApiFixture } from './declarations/declaration'
import { WEB_API_FIXTURE_IDS, loadWebApiFixture } from './fixture-loader'

function webManifestFixtures() {
  return manifest.fixtures.filter(entry => entry.consumers.includes('web'))
}

describe('web fixture declarations', () => {
  it('loads exactly the web manifest fixtures with bodies and routes', () => {
    const fixtures = webManifestFixtures()

    expect(fixtures.every(entry => entry.bodyFile && entry.route)).toBe(true)
    expect([...WEB_API_FIXTURE_IDS].toSorted()).toEqual(fixtures.map(entry => entry.id).toSorted())
  })

  it('rejects duplicate declaration IDs', () => {
    const declaration = WEB_API_FIXTURE_DECLARATIONS[0]

    expect(() => indexWebApiFixtureDeclarations([declaration, declaration])).toThrow(
      `Duplicate web API fixture declaration: ${declaration.id} at indices 0 and 1`,
    )
  })

  it('returns independent structured clones', () => {
    const first = loadWebApiFixture('shared.currencies.list.default')
    const second = loadWebApiFixture('shared.currencies.list.default')

    expect(first.results[0]).toBeDefined()
    Reflect.set(first.results[0]!, 'code', 'changed')

    expect(second.results[0]!.code).toBe('aud')
    expect(first).not.toBe(second)
  })

  it('ties each declaration body to its endpoint invocation response', () => {
    const declaration = defineWebApiFixture<{ value: string }>()(
      'test.compatible-invocation',
      { value: 'fixture' },
      async () => ({ value: 'runtime' }),
    )

    function assertIncompatibleInvocationsAreRejected() {
      defineWebApiFixture<{ value: string }>()(
        'test.incompatible-invocation',
        { value: 'fixture' },
        // @ts-expect-error The invocation response must implement the declared fixture body.
        async () => ({ different: 'runtime' }),
      )
      defineWebApiFixture<{ value: string }>()(
        'test.missing-invocation-response',
        { value: 'fixture' },
        // @ts-expect-error Only null-body declarations may invoke endpoints with no response body.
        async () => undefined,
      )
    }

    expect(declaration.body).toEqual({ value: 'fixture' })
    expect(assertIncompatibleInvocationsAreRejected).toBeTypeOf('function')
  })
})
