import { describe, expect, it } from 'vitest'
import manifest from '../../../../../api-fixtures/v1/manifest.json'
import { mergeEndpointRegistries } from '../test-helpers/manifest-coverage/endpoint-registry'
import { nonWebEndpointRegistry } from '../test-helpers/manifest-coverage/registry'

const nonWebFixtures = manifest.fixtures.filter(entry => !entry.consumers.includes('web'))

describe('web API client manifest endpoint coverage', () => {
  it('rejects duplicate non-web endpoint IDs', () => {
    const endpoint = { method: 'GET', path: '/api/v1/example' }

    expect(() => mergeEndpointRegistries({ duplicate: endpoint }, { duplicate: endpoint })).toThrow(
      'Duplicate manifest endpoint fixture: duplicate',
    )
  })

  it('represents every non-web manifest endpoint fixture', () => {
    expect(Object.keys(nonWebEndpointRegistry).toSorted()).toEqual(
      nonWebFixtures.map(entry => entry.id).toSorted(),
    )
  })

  it('matches each fixture method, path, query, and declared request body', () => {
    const missing: string[] = []
    const methodMismatches: string[] = []
    const pathMismatches: string[] = []
    const queryMismatches: string[] = []
    const bodyMismatches: string[] = []

    for (const fixture of nonWebFixtures) {
      const endpoint = nonWebEndpointRegistry[fixture.id]
      if (!endpoint) {
        missing.push(fixture.id)
        continue
      }
      if (endpoint.method !== fixture.method) {
        methodMismatches.push(`${fixture.id}: ${endpoint.method} !== ${fixture.method}`)
      }
      if (endpoint.path !== fixture.path) {
        pathMismatches.push(`${fixture.id}: ${endpoint.path} !== ${fixture.path}`)
      }

      for (const [name, value] of Object.entries(fixture.query ?? {})) {
        if (endpoint.query?.[name] !== value) {
          queryMismatches.push(`${fixture.id}: ${name}=${endpoint.query?.[name]} !== ${value}`)
        }
      }

      if ('requestBody' in fixture && !jsonContains(endpoint.requestBody, fixture.requestBody)) {
        bodyMismatches.push(fixture.id)
      }
    }

    expect(missing).toEqual([])
    expect(methodMismatches).toEqual([])
    expect(pathMismatches).toEqual([])
    expect(queryMismatches).toEqual([])
    expect(bodyMismatches).toEqual([])
  })
})

function jsonContains(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length)
      return false
    return expected.every((value, index) => jsonContains(actual[index], value))
  }
  if (!isRecord(actual) || !isRecord(expected)) return false
  return Object.entries(expected).every(
    ([key, value]) => Object.hasOwn(actual, key) && jsonContains(actual[key], value),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
