import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { ApiFixtureManifest } from './types.mts'
import { buildApiFixtureManifest } from './write.mts'

const manifest = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
) as ApiFixtureManifest

describe('fixture validation with a shared full response catalog', () => {
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

  it('retains fixture parameter spellings when full catalog routes use another spelling', () => {
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

  it('rejects ambiguous full catalog route spellings', () => {
    const key = 'GET:/api/v1/communities/:communitySlug'
    expect(() =>
      buildApiFixtureManifest({
        ...manifest.backendResponseContracts,
        'GET:/api/v1/communities/:communityIdOrSlug': manifest.backendResponseContracts[key]!,
      }),
    ).toThrow(/Ambiguous response contract route shape/)
  })
})
