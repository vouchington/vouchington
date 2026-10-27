import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, onTestFinished } from 'vitest'
import { settlePostCommitEffects } from './post-commit-completion.mts'
import { drainOwnedTestAction } from '../../test-helpers/post-commit-completion.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('settlePostCommitEffects', () => {
  it('reports a synchronous start failure and joins later work despite reported-rejection ownership', async () => {
    const error = new Error(`Owned synchronous start failure ${crypto.randomUUID()}`)
    const held = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    let settled = false
    await drainOwnedTestAction(
      () =>
        settlePostCommitEffects([
          {
            start: () => {
              throw error
            },
            isRejectionReported: () => true,
          },
          {
            start: () => {
              started.resolve()
              return held.promise
            },
          },
        ]).then(() => {
          settled = true
          return undefined
        }),
      () => held.resolve(),
      async operation => {
        await started.promise
        expect(settled).toBe(false)
        held.resolve()
        await operation
        expect(settled).toBe(true)
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([reported]) => reported === error),
        ).toHaveLength(1)
      },
    )
  })

  it('normalizes a raw undefined rejection and tolerates its SDK reporter throwing', async () => {
    const scope = new AsyncLocalStorage<symbol>()
    const owner = Symbol('owned raw rejection')
    const priorReport = sentryCaptureExceptionMock.getMockImplementation()
    const ownedReports: unknown[] = []
    sentryCaptureExceptionMock.mockImplementation((error, ...args) => {
      if (scope.getStore() !== owner) return priorReport?.(error, ...args)
      ownedReports.push(error)
      throw new Error('Owned reporter failed')
    })
    onTestFinished(() => {
      sentryCaptureExceptionMock.mockImplementation(priorReport ?? (() => undefined))
    })
    await expect(
      scope.run(owner, () =>
        settlePostCommitEffects([
          {
            start: () => {
              const failure = Promise.withResolvers<never>()
              failure.reject(undefined)
              return failure.promise
            },
          },
        ]),
      ),
    ).resolves.toBeUndefined()
    expect(ownedReports).toHaveLength(1)
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === ownedReports[0]),
    ).toHaveLength(1)
    expect(ownedReports[0]).toMatchObject({
      message: 'Post-commit effect failed',
      cause: undefined,
    })
  })
})
