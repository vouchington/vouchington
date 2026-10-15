import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMigrationInitializationFixture } from '@voucha/test-helpers/migration-initialization'
import { runViews } from './migrate.mts'

import { migrationInitializers as initialization } from '@voucha/test-helpers/migration-initialization-mocks'

vi.mock<typeof import('@vouchington/postgres')>(import('@vouchington/postgres'), async original => {
  const { mockMigrationPostgres } =
    await import('@voucha/test-helpers/migration-initialization-mocks')
  return mockMigrationPostgres(original)
})
vi.mock<typeof import('vouchington-tooling/sql-ast')>(
  import('vouchington-tooling/sql-ast'),
  async original => {
    const { mockMigrationSqlAst } =
      await import('@voucha/test-helpers/migration-initialization-mocks')
    return mockMigrationSqlAst(original)
  },
)

describe('migration SQL initialization failures', () => {
  beforeEach(() => {
    initialization.parser.mockReset()
    initialization.ast.mockReset()
  })

  it('settles both started initializers before retaining their ordered failures and cause', async () => {
    const statements = await import('./migration-runner/sql-statements.mts')
    expect(statements.loadSqlParserModule).toBe(initialization.parser)
    expect(statements.initSqlAst).toBe(initialization.ast)
    const fixture = await createMigrationInitializationFixture()
    const parserError = new Error('SQL parser initialization failed')
    const astError = new Error('SQL AST initialization failed')
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let astSettled = false
    let astOperation: Promise<void> | undefined
    let astResults: PromiseSettledResult<void>[] = []
    initialization.parser.mockRejectedValueOnce(parserError)
    initialization.ast.mockImplementationOnce(() => {
      astOperation = release.promise.then(() => {
        astSettled = true
        throw astError
      })
      started.resolve()
      return astOperation
    })
    const result = runViews(fixture.options).then(
      () => ({ error: undefined, astSettled }),
      (err: unknown) => ({ error: err, astSettled }),
    )
    let readiness: 'started' | 'completed'
    try {
      readiness = await Promise.race([
        started.promise.then(() => 'started' as const),
        result.then(() => 'completed' as const),
      ])
    } finally {
      release.resolve()
      astResults = await Promise.allSettled(astOperation ? [astOperation] : [])
      await result
    }
    const outcome = await result
    expect(readiness).toBe('started')
    expect(astResults).toHaveLength(1)
    const astResult = astResults[0]
    if (astResult?.status !== 'rejected')
      throw new Error('Expected owned initializer rejection', { cause: astResult })
    expect(astResult.reason).toBe(astError)
    expect(outcome.astSettled).toBe(true)
    expect(outcome.error).toBeInstanceOf(AggregateError)
    if (!(outcome.error instanceof AggregateError))
      throw new Error('Expected both initialization failures', { cause: outcome.error })
    expect(outcome.error.errors).toHaveLength(2)
    expect(outcome.error.errors[0]).toBe(parserError)
    expect(outcome.error.errors[1]).toBe(astError)
    expect(outcome.error.cause).toBe(parserError)
    expect(fixture.sqlAttempts).toBe(0)
  })

  it('preserves a single rejected reason by identity after the sibling initializer settles', async () => {
    const fixture = await createMigrationInitializationFixture()
    const reason = new Error('single parser initialization failure')
    initialization.parser.mockRejectedValueOnce(reason)
    initialization.ast.mockResolvedValueOnce(undefined)
    const result = await runViews(fixture.options).then(
      () => ({ error: undefined }),
      (err: unknown) => ({ error: err }),
    )
    expect(result.error).toBe(reason)
    expect(initialization.ast).toHaveBeenCalledOnce()
    expect(fixture.sqlAttempts).toBe(0)

    // Exercise a missed observation with the genuine public initializers, not another mock result.
    const actualParser =
      await vi.importActual<typeof import('@vouchington/postgres')>('@vouchington/postgres')
    const actualAst = await vi.importActual<typeof import('vouchington-tooling/sql-ast')>(
      'vouchington-tooling/sql-ast',
    )
    initialization.parser.mockImplementation(actualParser.loadSqlParserModule)
    initialization.ast.mockImplementation(actualAst.initSqlAst)
    const missingReadiness = Promise.withResolvers<void>()
    const realCompletion = runViews(fixture.options).then(
      () => ({ kind: 'completed' as const }),
      (err: unknown) => ({ kind: 'failed' as const, error: err }),
    )
    const observed = await Promise.race([
      missingReadiness.promise.then(() => 'started' as const),
      realCompletion.then(() => 'completed' as const),
    ])
    expect(observed).toBe('completed')
    expect(await realCompletion).toEqual({ kind: 'completed' })
    expect(fixture.sqlAttempts).toBe(0)
  })
})
