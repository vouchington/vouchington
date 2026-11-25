import { describe, expect, it, vi } from 'vitest'
import { beginBoundedTransaction, registerPostCommitAction, write } from './setup.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { runTransactionActionSettlementProbe } from '../../test-helpers/data-stores/psql/post-commit-actions.mts'

describe('transaction post-commit actions wiring', () => {
  it('reports post-commit action failures through onError while settling siblings', async () => {
    const failure = new Error('Owned synchronous commit action failure')
    const sibling = vi.fn<() => Promise<void>>(async () => undefined)
    const persisted = await runTransactionActionSettlementProbe([
      () => {
        throw failure
      },
      sibling,
    ])
    expect(persisted).toBe(true)
    expect(sibling).toHaveBeenCalledOnce()
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
    ).toHaveLength(1)
  })

  it('owns bounded transactions so post-commit actions run after commit', async () => {
    const committed = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginBoundedTransaction({
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 5_000,
    })
    registerPostCommitAction(transaction, committed)
    await transaction.commit()
    expect(committed).toHaveBeenCalledOnce()
  })

  it('rejects unowned queries with the @data-stores/psql wrapper message', () => {
    expect(() => registerPostCommitAction(write, () => undefined)).toThrow(
      'Post-commit actions require a transaction query owned by @data-stores/psql wrappers',
    )
  })
})
