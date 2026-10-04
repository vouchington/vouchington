import { beforeAll, describe, expect, it } from 'vitest'
import ts from 'typescript'

import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from '../api-fixtures/cold-build-budget.mts'
import { buildVirtualProgramMatrix } from '../api-fixtures/virtual-program.mts'
import { requestCarrierOrigins } from './request-validation-route-carrier-origin.mts'
import { discoverRuntimeValidatedOperationsForProgram } from './request-validation-route-coverage.mts'
import { handlerCarrierBindings } from './request-validation-route-visit.mts'

const route = (write: string, before: boolean, option = 'alias') => `
  declare const app: any
  declare const other: any
  declare function validateRequestContract(ctx: any, key: string, options: object): void
  app.route('/api/v1/search').get((ctx: any) => {
    let query: Record<string, unknown> = {}
    const alias = query
    ${before ? write : ''}
    validateRequestContract(ctx, 'GET:/api/v1/search', { query: ${option} })
    ${before ? '' : write}
  })
`

const sources = {
  'property-before': route('alias.term = ctx.query.term', true),
  'property-after': route('alias.term = ctx.query.term', false),
  'object-before': route('query = ctx.query', true, 'query'),
  'object-after': route('query = ctx.query', false, 'query'),
  'header-direct': route(
    "validateRequestContract(ctx, 'GET:/api/v1/search', { header: ctx.req.headers })",
    true,
  ),
  'header-alias': route(
    "const headers = ctx.req.headers; validateRequestContract(ctx, 'GET:/api/v1/search', { header: headers.authorization })",
    true,
  ),
  'header-context-alias': route(
    "const renamed = ctx; const headers = renamed.req.headers; validateRequestContract(ctx, 'GET:/api/v1/search', { header: headers.authorization })",
    true,
  ),
  'header-unrelated': route(
    "validateRequestContract(ctx, 'GET:/api/v1/search', { header: other.req.headers })",
    true,
  ),
} as const

let matrix: ReturnType<typeof buildVirtualProgramMatrix>

describe('request carrier origin at validator use', () => {
  beforeAll(() => {
    matrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it.each([
    ['property-before', true],
    ['property-after', false],
    ['object-before', true],
    ['object-after', false],
  ] as const)(
    '%s credits only preceding writes in the registered handler',
    (sourceId, valid) => {
      const source = matrix.sourceFile(sourceId)
      const registrationLine =
        source.text.split('\n').findIndex(line => line.includes("app.route('/api/v1/search')")) + 1
      const routes = [
        {
          method: 'GET',
          routeTemplate: '/api/v1/search',
          source: `${source.fileName.split('/').at(-1)}:${registrationLine}`,
        },
      ]
      const inspect = () =>
        discoverRuntimeValidatedOperationsForProgram(matrix.program, [source], routes, {
          validator: () => {},
          voteFactory: () => {},
        })
      let validated = new Set<string>()
      let failure = ''
      try {
        validated = inspect()
      } catch (err) {
        failure = String(err)
      }
      expect(validated.has('GET:/api/v1/search')).toBe(valid)
      expect(failure).toMatch(valid ? /^$/ : /query option lacks handler query input lineage/)
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it.each([
    ['header-direct', true],
    ['header-alias', true],
    ['header-context-alias', true],
    ['header-unrelated', false],
  ] as const)(
    '%s traces only registered-context request headers',
    (sourceId, valid) => {
      const source = matrix.sourceFile(sourceId)
      const checker = matrix.program.getTypeChecker()
      const handler = findHandler(source)
      const call = findHeaderValidation(handler)
      const options = call.arguments[2]
      if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing options')
      const header = options.properties.find(
        property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'header',
      )
      if (!header || !ts.isPropertyAssignment(header)) throw new Error('Missing header')
      const origins = requestCarrierOrigins(
        header.initializer,
        checker,
        handlerCarrierBindings(handler, checker),
      )
      expect(origins.has('header')).toBe(valid)
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )
})

function findHandler(source: ts.SourceFile): ts.ArrowFunction {
  let result: ts.ArrowFunction | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isArrowFunction(node)) result = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!result) throw new Error('Missing handler')
  return result
}

function findHeaderValidation(handler: ts.ArrowFunction): ts.CallExpression {
  let result: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'validateRequestContract') {
      const options = node.arguments[2]
      if (options?.getText().includes('header:')) result = node
    }
    ts.forEachChild(node, visit)
  }
  visit(handler)
  if (!result) throw new Error('Missing header validation')
  return result
}
