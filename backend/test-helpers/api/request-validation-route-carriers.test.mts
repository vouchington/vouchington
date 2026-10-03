import { beforeAll, describe, expect, it } from 'vitest'

import { virtualSources } from './request-validation-route-virtual-sources.mts'
import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from '../api-fixtures/cold-build-budget.mts'
import {
  buildVirtualProgramMatrix,
  type VirtualProgramMatrix,
} from '../api-fixtures/virtual-program.mts'
import { assertQueryCarrierCoverage } from './request-validation-route-carriers.mts'
import { discoverRuntimeValidatedOperationsForProgram } from './request-validation-route-coverage.mts'
import { discoverSourceInputOperationsForProgram } from './request-validation-route-input.mts'
import { discoverInlineUuidQueryAssertionsForProgram } from './request-validation-route-specialized.mts'

let virtualProgram: VirtualProgramMatrix<keyof typeof virtualSources>

function virtualRoute(sourceId: keyof typeof virtualSources) {
  const source = virtualProgram.sourceFile(sourceId)
  const sourceName = source.fileName.replaceAll('\\', '/').split('/').at(-1)
  const line =
    source.text.split('\n').findIndex(value => value.includes("app.route('/api/v1/search')")) + 1
  return {
    source,
    route: { method: 'GET', routeTemplate: '/api/v1/search', source: `${sourceName}:${line}` },
  }
}

describe('compiler-backed query carrier scanner', () => {
  beforeAll(() => {
    virtualProgram = buildVirtualProgramMatrix(import.meta, virtualSources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it(
    'tracks invoked query helpers with renamed handler parameters without trusting path checks',
    () => {
      const source = virtualProgram.sourceFile('query-helper')
      const sourceName = source.fileName.replaceAll('\\', '/').split('/').at(-1)
      const route = {
        method: 'GET',
        routeTemplate: '/api/v1/search',
        source: `${sourceName}:5`,
      }
      const routes = [route]
      const inputs = discoverSourceInputOperationsForProgram(
        virtualProgram.program,
        [source],
        routes,
      )
      const queryReads = new Map<string, Set<string>>()
      discoverSourceInputOperationsForProgram(virtualProgram.program, [source], routes, queryReads)
      const carrierFamilies = new Map<string, Set<string>>()
      const validated = discoverRuntimeValidatedOperationsForProgram(
        virtualProgram.program,
        [source],
        routes,
        { validator: () => {}, voteFactory: () => {}, carrierFamilies },
      )

      expect(inputs).toEqual(new Set(['GET:/api/v1/search']))
      expect(queryReads.get('GET:/api/v1/search')).toEqual(new Set(['term']))
      expect(validated).toEqual(new Set(['GET:/api/v1/search']))
      expect(carrierFamilies.get('GET:/api/v1/search')).toEqual(new Set(['path']))
      expect(() =>
        assertQueryCarrierCoverage(
          queryReads,
          carrierFamilies,
          { 'GET:/api/v1/search': { query: { properties: { term: { type: 'string' } } } } },
          {},
        ),
      ).toThrow(/without runtime query validation/)
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'ignores a dead nested query helper',
    () => {
      const { source, route } = virtualRoute('dead-query-helper')
      const operations = discoverSourceInputOperationsForProgram(
        virtualProgram.program,
        [source],
        [route],
      )
      expect(operations).toEqual(new Set())
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'rejects wrong and dynamic operation keys in an invoked local validator helper',
    () => {
      ;(['wrong-key-helper', 'dynamic-key-helper'] as const).forEach(sourceId => {
        const { source, route } = virtualRoute(sourceId)
        expect(() =>
          discoverRuntimeValidatedOperationsForProgram(virtualProgram.program, [source], [route], {
            validator: () => {},
            voteFactory: () => {},
          }),
        ).toThrow(
          sourceId === 'wrong-key-helper'
            ? /validates GET:\/api\/v1\/other/
            : /non-static operation key/,
        )
      })
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'ignores dead validators and rejects a same-named untrusted validator',
    () => {
      const dead = virtualRoute('dead-validator')
      expect(
        discoverRuntimeValidatedOperationsForProgram(
          virtualProgram.program,
          [dead.source],
          [dead.route],
        ),
      ).toEqual(new Set())

      const spoof = virtualRoute('spoof-validator')
      expect(() =>
        discoverRuntimeValidatedOperationsForProgram(
          virtualProgram.program,
          [spoof.source],
          [spoof.route],
        ),
      ).toThrow(/not the trusted backend validator/)
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'tracks query aliases and static element keys and fails closed on dynamic query keys',
    () => {
      const alias = virtualRoute('aliased-query')
      const aliasReads = new Map<string, Set<string>>()
      discoverSourceInputOperationsForProgram(
        virtualProgram.program,
        [alias.source],
        [alias.route],
        aliasReads,
      )
      expect(aliasReads.get('GET:/api/v1/search')).toEqual(new Set(['term']))

      const dynamic = virtualRoute('dynamic-query')
      const dynamicReads = new Map<string, Set<string>>()
      discoverSourceInputOperationsForProgram(
        virtualProgram.program,
        [dynamic.source],
        [dynamic.route],
        dynamicReads,
      )
      expect(dynamicReads.get('GET:/api/v1/search')).toEqual(new Set(['*', 'key']))
      expect(() =>
        assertQueryCarrierCoverage(
          dynamicReads,
          new Map([['GET:/api/v1/search', new Set(['query'])]]),
          { 'GET:/api/v1/search': { query: { properties: { term: { type: 'string' } } } } },
          {},
        ),
      ).toThrow(/undeclared query key/)
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'records destructured query keys with aliases',
    () => {
      const { source, route } = virtualRoute('destructured-query')
      const reads = new Map<string, Set<string>>()
      discoverSourceInputOperationsForProgram(virtualProgram.program, [source], [route], reads)
      expect(reads.get('GET:/api/v1/search')).toEqual(new Set(['new_filter']))
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'rejects a query validator given the path carrier',
    () => {
      ;(
        [
          'wrong-carrier',
          'empty-query-carrier',
          'unrelated-query-carrier',
          'cross-carrier',
        ] as const
      ).forEach(sourceId => {
        const { source, route } = virtualRoute(sourceId)
        expect(() =>
          discoverRuntimeValidatedOperationsForProgram(virtualProgram.program, [source], [route], {
            validator: () => {},
            voteFactory: () => {},
          }),
        ).toThrow(/query option lacks handler query input lineage/)
      })
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'follows normalized query input through shorthand options',
    () => {
      const { source, route } = virtualRoute('normalized-query-carrier')
      const carrierFamilies = new Map<string, Set<string>>()
      expect(
        discoverRuntimeValidatedOperationsForProgram(virtualProgram.program, [source], [route], {
          validator: () => {},
          voteFactory: () => {},
          carrierFamilies,
        }),
      ).toEqual(new Set(['GET:/api/v1/search']))
      expect(carrierFamilies.get('GET:/api/v1/search')).toEqual(new Set(['query']))
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'requires body validation options to originate from the registered context',
    () => {
      const inspect = (sourceId: 'valid-body-carrier' | 'wrong-body-carrier') => {
        const { source, route: baseRoute } = virtualRoute(sourceId)
        const route = { ...baseRoute, method: 'POST' }
        const carrierFamilies = new Map<string, Set<string>>()
        const validated = discoverRuntimeValidatedOperationsForProgram(
          virtualProgram.program,
          [source],
          [route],
          { validator: () => {}, voteFactory: () => {}, carrierFamilies },
        )
        return { validated, carrierFamilies }
      }
      expect(inspect('valid-body-carrier').carrierFamilies.get('POST:/api/v1/search')).toEqual(
        new Set(['body']),
      )
      expect(() => inspect('wrong-body-carrier')).toThrow(
        /body option lacks handler body input lineage/,
      )
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'follows query-carrier assignments only in the handler scope',
    () => {
      const live = virtualRoute('assigned-query-carrier')
      const dead = virtualRoute('dead-assigned-query-carrier')
      const inspect = (value: typeof live) =>
        discoverRuntimeValidatedOperationsForProgram(
          virtualProgram.program,
          [value.source],
          [value.route],
          { validator: () => {}, voteFactory: () => {}, carrierFamilies: new Map() },
        )
      expect(inspect(live)).toEqual(new Set(['GET:/api/v1/search']))
      expect(() => inspect(dead)).toThrow(/query option lacks handler query input lineage/)
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'counts only an executed inline UUID assertion for the exact request_id value',
    () => {
      const inspect = (sourceId: keyof typeof virtualSources, trustStub = false) => {
        const { source, route } = virtualRoute(sourceId)
        return discoverInlineUuidQueryAssertionsForProgram(
          virtualProgram.program,
          [source],
          [route],
          trustStub ? node => node.text === 'isUUID' : undefined,
        )
      }
      expect(inspect('live-inline-uuid', true)).toEqual(new Set(['GET:/api/v1/search']))
      for (const sourceId of [
        'dead-inline-uuid',
        'wrong-inline-uuid',
        'mixed-inline-uuid',
        'always-true-inline-uuid',
        'unrelated-inline-uuid',
        'constant-inline-uuid',
      ] as const) {
        expect(inspect(sourceId, true)).toEqual(new Set())
      }
      expect(inspect('fake-inline-uuid')).toEqual(new Set())
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )
})
