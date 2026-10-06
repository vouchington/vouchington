import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createBackendContractCatalogLoader } from './backend-contract-catalog-loader.mts'
import { settleBackendProgramBuild } from './backend-program-settlement.mts'
import type { BackendProgram, BackendProgramGeneration } from './backend-program.mts'
import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { buildVirtualProgramMatrix, type VirtualProgramMatrix } from './virtual-program.mts'

const item = 'POST:/api/v1/items'
const widget = 'POST:/api/v1/widgets'
const sources = {
  first: routeSource('string', 'first', false),
  second: `${routeSource('number', 'second', true)}
    app.route('/api/v1/added').get((ctx: any) => ctx.json({ added: true }))`,
  invalid: `
    declare const app: any
    app.route('/api/v1/items').post(async (ctx: any) => {
      const body = await ctx.request.json() as { payload: any }
      ctx.json(body)
    })
  `,
}
let matrix: VirtualProgramMatrix<keyof typeof sources>
type Loader = ReturnType<typeof createBackendContractCatalogLoader>

function routeSource(payloadType: string, queryName: string, required: boolean): string {
  return `
    declare const app: any
    declare function apiQuery(key: string, carrier: unknown): void
    declare function apiHeaders(key: string, contract: unknown): void
    const carrier = { queryContract: { ${queryName}: { kind: 'boolean' as const } } }
    app.route('/api/v1/items').post(async (ctx: any) => {
      apiQuery('${item}', carrier)
      apiHeaders('${item}', { request: { 'x-item': { type: 'string', required: ${required} } } })
      const body = await ctx.request.json() as { payload: ${payloadType} }
      ctx.json(body)
    })
    app.route('/api/v1/widgets').post(async (ctx: any) => {
      const body = await ctx.request.json() as { widget: string }
      ctx.json(body)
    })
  `
}

function snapshot(source: keyof typeof sources): BackendProgram {
  return {
    generation: Object.freeze({}) as BackendProgramGeneration,
    program: matrix.program,
    routeFiles: [matrix.sourceFile(source)],
  }
}

function loadEveryCache(loader: Loader) {
  const known = new Set([item, widget])
  return {
    responses: loader.loadBackendResponseContracts(new Set([item])),
    requests: loader.loadBackendRequestContracts(new Set([item])),
    queries: loader.loadBackendQueryContracts(known),
    headers: loader.loadBackendHeaderContracts(known),
    routes: loader.loadRegisteredRouteCatalog(),
    catalog: loader.loadBackendContractCatalog(),
  }
}

describe('bounded backend contract catalog caches', () => {
  beforeAll(() => {
    matrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it('reuses every cache on warm calls and refreshes them together on a new generation', () => {
    let current = snapshot('first')
    const provide = vi.fn<() => BackendProgram>(() => current)
    const loader = createBackendContractCatalogLoader(provide)
    // Populate standalone caches before a combined catalog exists.
    const first = loadEveryCache(loader)
    const warm = loadEveryCache(loader)
    for (const key of Object.keys(first) as (keyof typeof first)[]) {
      expect(warm[key]).toBe(first[key])
    }
    expect(provide).toHaveBeenCalledTimes(12)

    current = snapshot('second')
    const second = loadEveryCache(loader)
    for (const key of Object.keys(first) as (keyof typeof first)[]) {
      expect(second[key]).not.toBe(first[key])
    }
    expect(second.responses[item]?.schema.root).toMatchObject({
      properties: { payload: { schema: { type: 'number' } } },
    })
    expect(second.requests[item]?.schema.root).toMatchObject({
      properties: { payload: { schema: { type: 'number' } } },
    })
    expect(second.queries[item]?.parameters).toHaveProperty('second')
    expect(second.queries[item]?.parameters).not.toHaveProperty('first')
    expect(second.headers[item]?.requestHeaders['x-item']?.required).toBe(true)
    expect(second.routes.map(route => route.routeTemplate)).toContain('/api/v1/added')
    expect(second.catalog.responses[item]?.schema).toEqual(second.responses[item]?.schema)
    expect(second.catalog.requests[item]?.schema).toEqual(second.requests[item]?.schema)
    expect(second.catalog.queries).toEqual(second.queries)
    expect(second.catalog.headers).toEqual(second.headers)
    const settledWarm = loadEveryCache(loader)
    for (const key of Object.keys(second) as (keyof typeof second)[]) {
      expect(settledWarm[key]).toBe(second[key])
    }
  })

  it('reuses combined catalog values and checks freshness before every derived lookup', () => {
    let current = snapshot('first')
    const loader = createBackendContractCatalogLoader(() => current)
    const first = loader.loadBackendContractCatalog()
    expect(loader.loadBackendResponseContracts()).toBe(first.responses)
    expect(loader.loadBackendRequestContracts()).toBe(first.requests)
    expect(loader.loadBackendQueryContracts(new Set([item, widget]))).toBe(first.queries)
    expect(loader.loadBackendHeaderContracts(new Set([item, widget]))).toBe(first.headers)
    expect(loader.loadRegisteredRouteCatalog()).toBe(first.routes)

    current = snapshot('second')
    // A derived loader must notice the new generation before the combined catalog is loaded.
    expect(loader.loadRegisteredRouteCatalog()).not.toBe(first.routes)
    expect(loader.loadBackendQueryContracts(new Set([item, widget]))).not.toBe(first.queries)
    expect(loader.loadBackendHeaderContracts(new Set([item, widget]))).not.toBe(first.headers)
    const second = loader.loadBackendContractCatalog()
    expect(loader.loadBackendResponseContracts()).toBe(second.responses)
    expect(loader.loadBackendRequestContracts()).toBe(second.requests)
  })

  it('keys requested subsets by their members, independent of iteration order', () => {
    const current = snapshot('first')
    const loader = createBackendContractCatalogLoader(() => current)
    for (const load of [loader.loadBackendResponseContracts, loader.loadBackendRequestContracts]) {
      const items = load(new Set([item]))
      const widgets = load(new Set([widget]))
      const both = load(new Set([item, widget]))
      expect(Object.keys(items)).toEqual([item])
      expect(Object.keys(widgets)).toEqual([widget])
      expect(Object.keys(both).toSorted()).toEqual([item, widget].toSorted())
      expect(widgets).not.toBe(items)
      expect(both).not.toBe(items)
      expect(load(new Set([widget, item]))).toBe(both)
      expect(Object.keys(load(new Set()))).toEqual([])
      expect(Object.keys(load()).toSorted()).toEqual([item, widget].toSorted())
    }
  })

  it('separates strict and lenient catalog, response and request entries', () => {
    const current = snapshot('invalid')
    const loader = createBackendContractCatalogLoader(() => current)
    const report = vi.fn<(error: unknown) => void>()
    const options = { onRouteError: report }
    const pairs = [
      [() => loader.loadBackendContractCatalog(), () => loader.loadBackendContractCatalog(options)],
      [
        () => loader.loadBackendResponseContracts(new Set([item])),
        () => loader.loadBackendResponseContracts(new Set([item]), options),
      ],
      [
        () => loader.loadBackendRequestContracts(new Set([item])),
        () => loader.loadBackendRequestContracts(new Set([item]), options),
      ],
    ] as const
    for (const [strict, lenient] of pairs) {
      expect(strict).toThrow(/any/)
      const value = lenient()
      expect(strict).toThrow(/any/)
      const reports = report.mock.calls.length
      expect(lenient()).toBe(value)
      expect(report).toHaveBeenCalledTimes(reports)
    }
    expect(report).toHaveBeenCalled()
  })

  it('reuses standalone query and header entries for reordered known-route sets', () => {
    const current = snapshot('first')
    const loader = createBackendContractCatalogLoader(() => current)
    for (const load of [loader.loadBackendQueryContracts, loader.loadBackendHeaderContracts]) {
      const value = load(new Set([item, widget]))
      expect(load(new Set([widget, item]))).toBe(value)
      expect(() => load(new Set([widget]))).toThrow(/unknown response route/)
      expect(load(new Set([item, widget]))).toBe(value)
    }
  })

  it('keeps known-route signatures separate even when a full catalog is available', () => {
    const current = snapshot('first')
    const loader = createBackendContractCatalogLoader(() => current)
    const catalog = loader.loadBackendContractCatalog()
    for (const [load, shared] of [
      [loader.loadBackendQueryContracts, catalog.queries],
      [loader.loadBackendHeaderContracts, catalog.headers],
    ] as const) {
      expect(load(new Set([item, widget]))).toBe(shared)
      expect(load(new Set([widget, item]))).toBe(shared)
      expect(() => load(new Set([widget]))).toThrow(/unknown response route/)
      expect(() => load(new Set())).toThrow(/unknown response route/)
      expect(load(new Set([item, widget]))).toBe(shared)
    }
  })

  it('composes every cache from the settled retry generation and preserves warm identity', () => {
    let current = snapshot('first')
    let rebuild = false
    const attempts: string[] = []
    const loader = createBackendContractCatalogLoader(() => {
      if (rebuild) {
        current = settleBackendProgramBuild('first' as 'first' | 'second', {
          buildAttempt(source) {
            attempts.push(source)
            return snapshot(source)
          },
          confirmAttempt(source) {
            return { configuration: 'second' as const, settled: source === 'second' }
          },
        })
        rebuild = false
      }
      return current
    })
    const first = loadEveryCache(loader)
    rebuild = true
    const settled = loadEveryCache(loader)
    expect(attempts).toEqual(['first', 'second'])
    const warm = loadEveryCache(loader)
    for (const key of Object.keys(first) as (keyof typeof first)[]) {
      expect(settled[key]).not.toBe(first[key])
      expect(warm[key]).toBe(settled[key])
    }
    expect(settled.queries[item]?.parameters).toHaveProperty('second')
    expect(settled.responses[item]?.schema).toEqual(settled.catalog.responses[item]?.schema)
  })
})
