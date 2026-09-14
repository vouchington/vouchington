import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
} from './query-capture.mts'
import { beginTransaction, registerPostCommitAction, withTransactionOptions } from './setup.mts'
import {
  captureBorrowedClientTransactionQuery,
  captureExplicitTransactionQuery,
  captureInternallyOwnedTransactionQuery,
  captureOwnedTransactionQuery,
} from '../../test-helpers/data-stores/psql/post-commit-actions-query-resource.mts'

describe('explicit query post-commit actions', () => {
  afterEach(() => {
    disableQueryCapture()
    clearCapturedQueries()
  })

  it('captures queries executed through an owned transaction', async () => {
    enableQueryCapture()
    await captureOwnedTransactionQuery()

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* ownedTransactionCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('captures an owned transaction passed as an explicit query exactly once', async () => {
    enableQueryCapture()
    await captureExplicitTransactionQuery()

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* explicitQueryCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('captures queries executed through an active borrowed client transaction', async () => {
    enableQueryCapture()
    await captureBorrowedClientTransactionQuery()

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* borrowedClientCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('captures queries executed through an internally owned transaction', async () => {
    enableQueryCapture()

    await captureInternallyOwnedTransactionQuery()

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* internalTransactionCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('defers nested query actions to an explicit transaction commit', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    await withTransactionOptions({ query: transaction }, async nestedQuery => {
      registerPostCommitAction(nestedQuery, action)
    })

    expect(action).not.toHaveBeenCalled()
    await transaction.commit()
    expect(action).toHaveBeenCalledOnce()
  })

  it('drops nested query actions when an explicit transaction rolls back', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    await withTransactionOptions({ query: transaction }, async nestedQuery => {
      registerPostCommitAction(nestedQuery, action)
    })
    await transaction.rollback()

    expect(action).not.toHaveBeenCalled()
  })

  it('drops a rejected nested query scope when the resource commits', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    await expect(
      withTransactionOptions({ query: transaction }, async nestedQuery => {
        registerPostCommitAction(nestedQuery, action)
        throw new Error('query-option rollback')
      }),
    ).rejects.toThrow('query-option rollback')
    await transaction.commit()
    expect(action).not.toHaveBeenCalled()
  })
})
