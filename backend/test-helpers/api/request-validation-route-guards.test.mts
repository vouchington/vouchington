import { beforeAll, describe, expect, it } from 'vitest'
import ts from 'typescript'

import { COLD_VIRTUAL_PROGRAM_TIMEOUT_MS } from '../api-fixtures/cold-build-budget.mts'
import { buildVirtualProgramMatrix } from '../api-fixtures/virtual-program.mts'
import { guardLineage, validatorDominatesRead } from './request-validation-route-guards.mts'

const sources = {
  guards: `
    declare function validate(): void
    const isStaff = true
    const isOwner = true
    function unconditional(ctx: any) {
      validate()
      return ctx.query.value
    }
    function exactGuard(ctx: any) {
      if (isStaff) {
        validate()
        return ctx.query.value
      }
      return undefined
    }
    function unconditionalBeforeGuard(ctx: any) {
      validate()
      if (isStaff) return ctx.query.value
      return undefined
    }
    function afterRead(ctx: any) {
      const value = ctx.query.value
      validate()
      return value
    }
    function conditionalOnly(ctx: any) {
      if (isStaff) validate()
      return ctx.query.value
    }
    function unrelatedGuard(ctx: any) {
      if (isStaff) validate()
      if (isOwner) return ctx.query.value
      return undefined
    }
    function shadowedGuard(ctx: any) {
      if (isStaff) validate()
      {
        const isStaff = true
        if (isStaff) return ctx.query.value
      }
      return undefined
    }
    function validationOnlyReturnBranch(ctx: any) {
      if (isStaff) {
        validate()
        return undefined
      }
      return ctx.query.value
    }
    function negatedOr(ctx: any) {
      isStaff || validate()
      return ctx.query.value
    }
    function nestedHelper(ctx: any) {
      function validateInOtherScope() { validate() }
      validateInOtherScope()
      return ctx.query.value
    }
    function loopGuard(ctx: any) {
      while (isStaff) validate()
      return ctx.query.value
    }
    function sameTryBlock(ctx: any) {
      try {
        validate()
        return ctx.query.value
      } catch {
        return undefined
      }
    }
    function tryValidatorCatchRead(ctx: any) {
      try {
        validate()
        throw new Error('after validation')
      } catch {
        return ctx.query.value
      }
    }
    function catchValidatorTryRead(ctx: any) {
      try {
        return ctx.query.value
      } catch {
        validate()
      }
    }
    function tryValidatorThenOutsideRead(ctx: any) {
      try {
        validate()
      } catch {
        // Continue to exercise that a swallowed validation error cannot dominate this read.
      }
      return ctx.query.value
    }
    function terminatingCatch(ctx: any) {
      try {
        validate()
      } catch (error) {
        throw error
      }
      return ctx.query.value
    }
    function conditionalReturnBeforeThrow(ctx: any) {
      try {
        validate()
      } catch (error) {
        if (isStaff) return undefined
        throw error
      }
      return ctx.query.value
    }
    function nestedReturnBeforeThrow(ctx: any) {
      try {
        validate()
      } catch (error) {
        function unused() { return undefined }
        throw error
      }
      return ctx.query.value
    }
    function finallyCanOverride(ctx: any) {
      try {
        validate()
      } catch (error) {
        throw error
      } finally {
        if (isStaff) return undefined
      }
      return ctx.query.value
    }
  `,
} as const

let programMatrix: ReturnType<typeof buildVirtualProgramMatrix>

describe('request-validation route guard proofs', () => {
  beforeAll(() => {
    programMatrix = buildVirtualProgramMatrix(import.meta, sources)
  }, COLD_VIRTUAL_PROGRAM_TIMEOUT_MS)

  it(
    'requires a preceding validator on the same exact guarded execution path',
    () => {
      const source = programMatrix.sourceFile('guards')
      const checker = programMatrix.program.getTypeChecker()
      const cases: readonly [string, boolean][] = [
        ['unconditional', true],
        ['exactGuard', true],
        ['unconditionalBeforeGuard', true],
        ['afterRead', false],
        ['conditionalOnly', false],
        ['unrelatedGuard', false],
        ['shadowedGuard', false],
        ['validationOnlyReturnBranch', false],
        ['negatedOr', false],
        ['nestedHelper', false],
        ['loopGuard', false],
        ['sameTryBlock', true],
        ['tryValidatorCatchRead', false],
        ['catchValidatorTryRead', false],
        ['tryValidatorThenOutsideRead', false],
        ['terminatingCatch', true],
        ['conditionalReturnBeforeThrow', false],
        ['nestedReturnBeforeThrow', true],
        ['finallyCanOverride', false],
      ]

      for (const [functionName, expected] of cases) {
        const fn = findFunction(source, functionName)
        const validator = findCall(fn, 'validate', functionName === 'nestedHelper')
        const read = findQueryRead(fn)
        expect(validatorDominatesRead([validator], read, checker)).toBe(expected)
      }
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )

  it(
    'serializes a const identifier guard by symbol identity and rejects unsupported branches',
    () => {
      const source = programMatrix.sourceFile('guards')
      const checker = programMatrix.program.getTypeChecker()
      const guarded = findFunction(source, 'exactGuard')
      const validator = findCall(guarded, 'validate')
      const read = findQueryRead(guarded)
      expect(guardLineage(validator, checker)).toBe(guardLineage(read, checker))

      const orBranch = findFunction(source, 'negatedOr')
      expect(guardLineage(findCall(orBranch, 'validate'), checker)).toBeUndefined()
      const loop = findFunction(source, 'loopGuard')
      expect(guardLineage(findCall(loop, 'validate'), checker)).toBeUndefined()
    },
    COLD_VIRTUAL_PROGRAM_TIMEOUT_MS,
  )
})

function findFunction(source: ts.SourceFile, name: string): ts.FunctionDeclaration {
  let result: ts.FunctionDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!result) throw new Error(`Missing test function ${name}`)
  return result
}

function findCall(scope: ts.Node, name: string, includeNested = false): ts.CallExpression {
  let result: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (!includeNested && node !== scope && ts.isFunctionLike(node)) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    )
      result ??= node
    ts.forEachChild(node, visit)
  }
  visit(scope)
  if (!result) throw new Error(`Missing ${name} call`)
  return result
}

function findQueryRead(scope: ts.Node): ts.PropertyAccessExpression {
  let result: ts.PropertyAccessExpression | undefined
  const visit = (node: ts.Node): void => {
    if (node !== scope && ts.isFunctionLike(node)) return
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'value' &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'query'
    ) {
      result ??= node
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  if (!result) throw new Error('Missing query read')
  return result
}
