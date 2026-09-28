import { beforeAll, describe, expect, it } from 'vitest'
import { discoverApiResponseContracts } from 'vouchington-tooling/api-contract-discovery'

import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { assertUniqueResponseAttribution } from './response-contract-ambiguous-attribution.mts'
import { buildVirtualProgramMatrix, type VirtualProgramMatrix } from './virtual-program.mts'

const sources = {
  'shared-json': `
    declare const app: any
    function sendItem(ctx: any) {
      ctx.json({ id: 'one' as string })
    }
    app.route('/api/v1/items').post((ctx: any) => {
      sendItem(ctx)
    })
    app.route('/api/v1/widgets').post((ctx: any) => {
      sendItem(ctx)
    })
  `,
  'shared-json-reference': `
    declare const app: any
    function sendItem(ctx: any) {
      ctx.json({ id: 'one' as string })
    }
    app.route('/api/v1/items').post(sendItem)
    app.route('/api/v1/widgets').post(sendItem)
  `,
  'per-route-json': `
    declare const app: any
    function itemBody() {
      return { id: 'one' as string }
    }
    app.route('/api/v1/items').post((ctx: any) => {
      ctx.json(itemBody())
    })
    app.route('/api/v1/widgets').post((ctx: any) => {
      ctx.json(itemBody())
    })
  `,
  'single-helper': `
    declare const app: any
    function sendItem(ctx: any) {
      ctx.json({ id: 'one' as string })
    }
    app.route('/api/v1/items').post((ctx: any) => {
      sendItem(ctx)
    })
  `,
  'shared-status': `
    declare const app: any
    function markCreated(ctx: any) {
      ctx.setStatus(201)
    }
    app.route('/api/v1/items').post((ctx: any) => {
      markCreated(ctx)
      ctx.json({ id: 'one' as string })
    })
    app.route('/api/v1/widgets').post((ctx: any) => {
      markCreated(ctx)
      ctx.json({ id: 'one' as string })
    })
  `,
  'shared-error': `
    declare const app: any
    function sendConflict(ctx: any) {
      ctx.setStatus(409)
      ctx.json({ error: 'conflict' as string })
    }
    app.route('/api/v1/items').post((ctx: any) => {
      sendConflict(ctx)
      ctx.setStatus(201)
      ctx.json({ id: 'one' as string })
    })
    app.route('/api/v1/widgets').post((ctx: any) => {
      sendConflict(ctx)
      ctx.setStatus(201)
      ctx.json({ id: 'one' as string })
    })
  `,
  'shared-dynamic-error': `
    declare const app: any
    function sendSearchError(ctx: any, error: any) {
      ctx.setStatus(error.status)
      ctx.json({ error: error.error })
    }
    app.route('/api/v1/posts').get((ctx: any) => {
      sendSearchError(ctx, { status: 422, error: 'bad' as string })
      ctx.json({ results: [] as string[] })
    })
    app.route('/api/v1/topics').get((ctx: any) => {
      sendSearchError(ctx, { status: 422, error: 'bad' as string })
      ctx.json({ results: [] as string[] })
    })
  `,
  'shared-dynamic-success': `
    declare const app: any
    function sendItem(ctx: any, created: any) {
      ctx.setStatus(created ? 201 : 200)
      ctx.json({ id: 'one' as string })
    }
    app.route('/api/v1/items').post((ctx: any) => {
      sendItem(ctx, true)
    })
    app.route('/api/v1/widgets').post((ctx: any) => {
      sendItem(ctx, false)
    })
  `,
} as const

let matrix: VirtualProgramMatrix<keyof typeof sources>

function attribute(sourceId: keyof typeof sources): void {
  assertUniqueResponseAttribution(matrix.program, [matrix.sourceFile(sourceId)])
}

function contracts(sourceId: keyof typeof sources) {
  return discoverApiResponseContracts(matrix.program, [matrix.sourceFile(sourceId)])
}

describe('ambiguous ctx.json response attribution', () => {
  beforeAll(() => {
    matrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it('rejects a ctx.json() call shared by two routes', () => {
    expect(() => attribute('shared-json')).toThrow(
      /ctx\.json\(\) cannot be attributed to one route \(POST:\/api\/v1\/items, POST:\/api\/v1\/widgets\)/,
    )
  })

  it('rejects a handler passed to two routes when the handler calls ctx.json()', () => {
    expect(() => attribute('shared-json-reference')).toThrow(
      /ctx\.json\(\) cannot be attributed to one route \(POST:\/api\/v1\/items, POST:\/api\/v1\/widgets\)/,
    )
  })

  it('keeps ctx.json() at each route when a helper only returns the body', () => {
    expect(() => attribute('per-route-json')).not.toThrow()
    expect(contracts('per-route-json')['POST:/api/v1/items']?.routeTemplate).toBe('/api/v1/items')
    expect(contracts('per-route-json')['POST:/api/v1/widgets']?.routeTemplate).toBe(
      '/api/v1/widgets',
    )
  })

  it('still attributes a helper used by exactly one route', () => {
    expect(() => attribute('single-helper')).not.toThrow()
    expect(contracts('single-helper')['POST:/api/v1/items']).toMatchObject({
      method: 'POST',
      routeTemplate: '/api/v1/items',
    })
  })

  it('does not reject a shared helper that only sets a non-contract status', () => {
    expect(() => attribute('shared-status')).not.toThrow()
    expect(contracts('shared-status')['POST:/api/v1/items']?.routeTemplate).toBe('/api/v1/items')
    expect(contracts('shared-status')['POST:/api/v1/widgets']?.routeTemplate).toBe(
      '/api/v1/widgets',
    )
  })

  it('does not reject a shared 4xx ctx.json() branch', () => {
    expect(() => attribute('shared-error')).not.toThrow()
    expect(contracts('shared-error')['POST:/api/v1/items']?.routeTemplate).toBe('/api/v1/items')
    expect(contracts('shared-error')['POST:/api/v1/widgets']?.routeTemplate).toBe('/api/v1/widgets')
  })

  it('does not reject a shared dynamic-status error payload', () => {
    expect(() => attribute('shared-dynamic-error')).not.toThrow()
    expect(contracts('shared-dynamic-error')['GET:/api/v1/posts']?.routeTemplate).toBe(
      '/api/v1/posts',
    )
    expect(contracts('shared-dynamic-error')['GET:/api/v1/topics']?.routeTemplate).toBe(
      '/api/v1/topics',
    )
  })

  it('rejects a shared success body even when its status is dynamic', () => {
    expect(() => attribute('shared-dynamic-success')).toThrow(
      /ctx\.json\(\) cannot be attributed to one route \(POST:\/api\/v1\/items, POST:\/api\/v1\/widgets\)/,
    )
  })
})
