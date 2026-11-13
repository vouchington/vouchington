import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fromCaseFile } from './resolve-case-file.mts'
import type { BackendResponseContract } from './response-contract-types.mts'
import type { ApiFixtureCase, ApiFixtureManifest } from './types.mts'
import { buildApiFixtureManifest } from './write.mts'

const manifest = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
) as ApiFixtureManifest

describe('fixture validation with explicit response contracts', () => {
  it('preserves pending fixture adoption metadata in serialized manifests', () => {
    const original: ApiFixtureCase = {
      id: 'synthetic.pending',
      method: 'GET',
      path: '/synthetic',
      route: { routeTemplate: '/synthetic' },
      auth: 'none',
      status: 200,
      body: {},
      consumers: ['swift-core'],
      migratedFrom: [],
    }
    const contract: BackendResponseContract = {
      source: 'test',
      method: 'GET',
      routeTemplate: '/synthetic',
      hash: 'synthetic',
      schema: {
        root: { type: 'object', properties: {}, additionalProperties: false },
        definitions: {},
      },
    }
    const contracts = { 'GET:/synthetic': contract }
    const [pending] = fromCaseFile('synthetic-case.mts', [{ ...original, pending: true }])
    const serialized = JSON.parse(JSON.stringify(buildApiFixtureManifest(contracts, [pending!])))
    expect(serialized.fixtures[0]).toMatchObject({ id: original.id, pending: true })
    const ordinary = buildApiFixtureManifest(
      contracts,
      fromCaseFile('synthetic-case.mts', [original]),
    )
    expect(ordinary.fixtures[0]).not.toHaveProperty('pending')
  })

  it('uses checked-in contracts without compiler discovery', () => {
    expect(buildApiFixtureManifest()).toEqual(manifest)
  })
  it('keeps fixture operations and explicit binary contracts in the canonical manifest', () => {
    const contracts = manifest.backendResponseContracts
    const extra = Object.values(contracts)[0]!
    expect(buildApiFixtureManifest({ ...contracts, 'GET:/not-a-fixture': extra })).toEqual(manifest)
  })

  it('still rejects a missing fixture response contract', () => {
    const contracts = { ...manifest.backendResponseContracts }
    delete contracts[Object.keys(contracts)[0]!]
    expect(() => buildApiFixtureManifest(contracts)).toThrow(/Fixture contract validation failed/)
  })

  it('retains fixture parameter spellings when explicit contract routes use another spelling', () => {
    const contracts = Object.fromEntries(
      Object.entries(manifest.backendResponseContracts).map(([key, contract]) => [
        key.replace(':communitySlug', ':communityIdOrSlug'),
        contract,
      ]),
    )
    expect(buildApiFixtureManifest(contracts)).toEqual(manifest)
  })

  it('does not substitute another response variant for a missing fixture variant', () => {
    const contracts = { ...manifest.backendResponseContracts }
    const key = Object.keys(contracts).find(candidate => candidate.includes('#'))!
    contracts[`${key.slice(0, key.indexOf('#'))}#not-the-requested-variant`] = contracts[key]!
    delete contracts[key]
    expect(() => buildApiFixtureManifest(contracts)).toThrow(/Fixture contract validation failed/)
  })

  it('rejects ambiguous explicit contract route spellings', () => {
    const key = 'GET:/api/v1/communities/:communitySlug'
    expect(() =>
      buildApiFixtureManifest({
        ...manifest.backendResponseContracts,
        'GET:/api/v1/communities/:communityIdOrSlug': manifest.backendResponseContracts[key]!,
      }),
    ).toThrow(/Ambiguous response contract route shape/)
  })
})
