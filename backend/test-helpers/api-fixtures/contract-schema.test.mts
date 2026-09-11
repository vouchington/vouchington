import { beforeAll, describe, expect, it } from 'vitest'

import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { extractResponseContracts } from './contract-schema.mts'
import { dynamicConfigApiFixtureCases } from './dynamic-config-cases.mts'
import { buildVirtualProgramMatrix, type VirtualProgramMatrix } from './virtual-program.mts'

const sources = {
  'constrained-array': `
    type ApiArrayContract<T, TMin extends number, TMax extends number, TUnique extends boolean> = T[]
    type ApiUuidContract = string & { readonly __apiUuidContract: never }
    interface ApiResponseContracts {
      result: { ids: ApiArrayContract<ApiUuidContract, 1, 100, true> }
    }
  `,
  'plain-uuid': `
    type ApiUuidContract = string & { readonly __apiUuidContract: never }
    interface ApiResponseContracts { result: { id: ApiUuidContract } }
  `,
} as const

let matrix: VirtualProgramMatrix<keyof typeof sources>

function contracts(sourceId: keyof typeof sources) {
  return extractResponseContracts(matrix.program, matrix.sourceFile(sourceId))
}

describe('backend API response contract schemas', () => {
  beforeAll(() => {
    matrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it('publishes Dynamic Config cases with developer authorization', () => {
    const authenticatedCases = dynamicConfigApiFixtureCases.filter(fixture =>
      fixture.path.startsWith('/api/v1/dynamic-config/'),
    )

    expect(authenticatedCases).not.toHaveLength(0)
    expect(authenticatedCases.every(fixture => fixture.auth === 'fixture-developer')).toBe(true)
    expect(dynamicConfigApiFixtureCases.map(fixture => fixture.id)).toEqual(
      expect.arrayContaining([
        'native.dynamic-config.namespaces.developer',
        'native.dynamic-config.namespace.typed',
        'native.dynamic-config.update.changed',
        'native.dynamic-config.update.no-op',
        'native.dynamic-config.history.default',
        'native.feature-flags.default',
      ]),
    )
  })

  it('injects ApiArrayContract bounds and ApiUuidContract uuid format', () => {
    const contract = contracts('constrained-array').result!
    const root = contract.schema.root
    expect(root).toMatchObject({ type: 'object' })
    if (root.type !== 'object') throw new Error('Expected an object schema')

    expect(root.properties.ids?.schema).toEqual({
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
    })
    expect(contracts('plain-uuid').result!.schema.root).toMatchObject({
      type: 'object',
      properties: { id: { schema: { type: 'string', format: 'uuid' } } },
    })
  })
})
