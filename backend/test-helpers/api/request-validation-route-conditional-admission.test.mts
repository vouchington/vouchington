import { beforeAll, describe, expect, it } from 'vitest'

import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from '../api-fixtures/cold-build-budget.mts'
import { buildVirtualProgramMatrix } from '../api-fixtures/virtual-program.mts'
import { discoverRuntimeValidatedOperationsForProgram } from './request-validation-route-coverage.mts'
import { discoverSourceInputOperationsForProgram } from './request-validation-route-input.mts'

const sources = {
  guarded: `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    const isStaff = true
    app.route('/api/v1/search').get((ctx: any) => {
      if (isStaff) {
        validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.query })
        return ctx.query.term
      }
    })`,
  'unguarded-read': `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    const isStaff = true
    app.route('/api/v1/search').get((ctx: any) => {
      if (isStaff) validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.query })
      return ctx.query.term
    })`,
  'unrelated-guard': `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    const isStaff = true
    const isOwner = true
    app.route('/api/v1/search').get((ctx: any) => {
      if (isStaff) validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.query })
      if (isOwner) return ctx.query.term
    })`,
  'early-return': `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    const isStaff = true
    app.route('/api/v1/search').get((ctx: any) => {
      if (isStaff) {
        validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.query })
        return
      }
      return ctx.query.term
    })`,
  'appeal-style': `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) => {
      const isStaff = true
      if (isStaff) {
        validateRequestContract(ctx, 'GET:/api/v1/search', {
          query: ctx.query.consistency === 'primary' ? { consistency: 'primary' } : {},
        })
      }
      return isStaff && ctx.query.consistency === 'primary'
    })`,
  'conditional-body-path': `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    const isStaff = true
    app.route('/api/v1/search/:id').post(async (ctx: any) => {
      if (isStaff) validateRequestContract(ctx, 'POST:/api/v1/search/:id', {
        path: ctx.params, body: await ctx.request.json(),
      })
      return ctx.params.id
    })`,
  'conditional-helper': `
    declare const app: any
    declare function validateRequestContract(ctx: any, key: string, options: object): void
    const isStaff = true
    function validate(ctx: any) {
      validateRequestContract(ctx, 'POST:/api/v1/search/:id', { path: ctx.params })
    }
    app.route('/api/v1/search/:id').post((ctx: any) => {
      if (isStaff) validate(ctx)
      return ctx.params.id
    })`,
} as const

let matrix: ReturnType<typeof buildVirtualProgramMatrix>

describe('conditional route validation admission', () => {
  beforeAll(() => {
    matrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it.each([
    ['guarded', true],
    ['unguarded-read', false],
    ['unrelated-guard', false],
    ['early-return', false],
    ['appeal-style', true],
    ['conditional-body-path', false],
    ['conditional-helper', false],
  ] as const)('%s admits only protected carriers', (sourceId, expected) => {
    const source = matrix.sourceFile(sourceId)
    const isPost = sourceId === 'conditional-body-path' || sourceId === 'conditional-helper'
    const method = isPost ? 'POST' : 'GET'
    const routeTemplate = isPost ? '/api/v1/search/:id' : '/api/v1/search'
    const line =
      source.text.split('\n').findIndex(value => value.includes(`app.route('${routeTemplate}')`)) +
      1
    const route = {
      method,
      routeTemplate,
      source: `${source.fileName.replaceAll('\\', '/').split('/').at(-1)}:${line}`,
    }
    const sites = new Map<string, import('typescript').Node[]>()
    discoverSourceInputOperationsForProgram(matrix.program, [source], [route], new Map(), sites)
    const families = new Map<string, Set<string>>()
    const validated = discoverRuntimeValidatedOperationsForProgram(
      matrix.program,
      [source],
      [route],
      {
        validator: () => {},
        voteFactory: () => {},
        carrierFamilies: families,
        queryReadSites: sites,
      },
    )
    const operation = `${method}:${routeTemplate}`
    expect(validated.has(operation)).toBe(expected)
    expect(families.get(operation)).toEqual(
      expected ? new Set([isPost ? 'path' : 'query']) : undefined,
    )
  })
})
