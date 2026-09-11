import { beforeAll, describe, expect, it } from 'vitest'

import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { discoverApiQueryContracts } from './query-contract-registry.mts'
import { buildVirtualProgramMatrix, type VirtualProgramMatrix } from './virtual-program.mts'

const knownItemsRoute = new Set(['GET:/api/v1/items'])
const queryPreamble = `
  declare const app: any
  declare function apiQuery(key: string, ...carriers: readonly unknown[]): void
`
const widenedSource = (descriptor: string) => `
  ${queryPreamble}
  const carrier = { queryContract: { q: ${descriptor} } }
  app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', carrier))
`
const sources = {
  explicit: `
    ${queryPreamble}
    type IntegerContract<TDefault extends number> = {
      readonly kind: 'integer'; readonly minimum: 1; readonly maximum: 100; readonly default: TDefault
    }
    const paging: { readonly queryContract: {
      readonly after: { readonly kind: 'string' }
      readonly limit: IntegerContract<25>
    } } = { queryContract: {
      after: { kind: 'string' },
      limit: { kind: 'integer', minimum: 1, maximum: 100, default: 25 },
    } } as const
    const filters = { queryContract: {
      ids: { kind: 'csv-array', items: { kind: 'string', format: 'uuid' }, style: 'form', explode: false },
      score: { kind: 'number' },
      sort: { kind: 'enum', values: ['new', 'top'], default: 'new' },
    } } as const
    app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', paging, filters))
  `,
  literal: `
    ${queryPreamble}
    const carrier = { queryContract: {
      q: { kind: 'string', description: 'Search text' },
    } } as const
    app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', carrier))
  `,
  'widened-description': widenedSource(
    `{ kind: 'string' as const, description: 'Search text' as string }`,
  ),
  'widened-format': widenedSource(`{ kind: 'string' as const, format: 'uuid' as string }`),
  'widened-default': widenedSource(
    `{ kind: 'integer' as const, minimum: 1 as const, maximum: 10 as const, default: 5 as number }`,
  ),
  unmarked: `
    declare const app: any
    const parser = { queryContract: { q: { kind: 'string' } } } as const
    app.route('/api/v1/items').get(() => parser)
  `,
  'dynamic-key': `
    ${queryPreamble}
    declare const key: string
    const carrier = { queryContract: { q: { kind: 'string' } } } as const
    app.route('/api/v1/items').get(() => apiQuery(key, carrier))
  `,
  mismatch: `
    ${queryPreamble}
    const carrier = { queryContract: { q: { kind: 'string' } } } as const
    app.route('/api/v1/items').get(() => apiQuery('POST:/api/v1/items', carrier))
  `,
  base: `
    ${queryPreamble}
    const carrier = { queryContract: { q: { kind: 'string' } } } as const
    app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', carrier))
  `,
  duplicate: `
    ${queryPreamble}
    const carrier = { queryContract: { q: { kind: 'string' } } } as const
    app.route('/api/v1/items').get(() => {
      apiQuery('GET:/api/v1/items', carrier)
      apiQuery('GET:/api/v1/items', carrier)
    })
  `,
  'duplicate-parameter': `
    ${queryPreamble}
    const one = { queryContract: { q: { kind: 'string' } } } as const
    const two = { queryContract: { q: { kind: 'boolean' } } } as const
    app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', one, two))
  `,
  'widened-keys': `
    ${queryPreamble}
    const carrier: { queryContract: Record<string, { kind: 'string' }> } = { queryContract: {} }
    app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', carrier))
  `,
  mystery: `
    ${queryPreamble}
    const carrier = { queryContract: { q: { kind: 'mystery' } } } as const
    app.route('/api/v1/items').get(() => apiQuery('GET:/api/v1/items', carrier))
  `,
} as const

let matrix: VirtualProgramMatrix<keyof typeof sources>

function discover(
  sourceId: keyof typeof sources,
  knownResponseRoutes: ReadonlySet<string> = knownItemsRoute,
) {
  return discoverApiQueryContracts(
    matrix.program,
    [matrix.sourceFile(sourceId)],
    knownResponseRoutes,
  )
}

describe('API query contract registry', () => {
  beforeAll(() => {
    matrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it('discovers explicit apiQuery markers and their typed carrier contracts', () => {
    const contracts = discover('explicit')

    expect(contracts).toEqual({
      'GET:/api/v1/items': {
        method: 'GET',
        routeTemplate: '/api/v1/items',
        parameters: {
          after: { kind: 'string' },
          ids: {
            kind: 'csv-array',
            items: { kind: 'string', format: 'uuid' },
            style: 'form',
            explode: false,
          },
          limit: { kind: 'integer', minimum: 1, maximum: 100, default: 25 },
          score: { kind: 'number' },
          sort: { kind: 'enum', values: ['new', 'top'], default: 'new' },
        },
      },
    })
  })

  it('preserves literal descriptions and rejects present widened descriptor options', () => {
    const literal = discover('literal')
    expect(literal['GET:/api/v1/items']!.parameters.q).toEqual({
      kind: 'string',
      description: 'Search text',
    })

    for (const sourceId of ['widened-description', 'widened-format', 'widened-default'] as const) {
      expect(() => discover(sourceId)).toThrow(/requires literal (description|format|default)/)
    }
  })

  it('ignores query-contract carriers without an explicit apiQuery marker', () => {
    const contracts = discover('unmarked')
    expect(contracts).toEqual({})
  })

  it('requires a literal operation key matching the enclosing route', () => {
    expect(() => discover('dynamic-key')).toThrow('requires a literal operation key')
    expect(() => discover('mismatch')).toThrow('does not match enclosing route GET:/api/v1/items')
  })

  it('rejects unknown response routes and duplicate operation markers', () => {
    expect(() => discover('base', new Set())).toThrow('unknown response route GET:/api/v1/items')
    expect(() => discover('duplicate')).toThrow('Duplicate apiQuery marker')
  })

  it('rejects duplicate query names across carriers', () => {
    expect(() => discover('duplicate-parameter')).toThrow('Duplicate query parameter contract: q')
  })

  it('rejects malformed and widened carrier contracts', () => {
    expect(() => discover('widened-keys')).toThrow('keys must be literal names')
    expect(() => discover('mystery')).toThrow('unsupported kind "mystery"')
  })
})
