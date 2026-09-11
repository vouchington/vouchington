import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
} from './query-capture.mts'
import { write } from './runtime.mts'
import { beginTransaction, registerPostCommitAction, withTransactionOptions } from './setup.mts'

describe('explicit query post-commit actions', () => {
  afterEach(() => {
    disableQueryCapture()
    clearCapturedQueries()
  })

  it('captures queries executed through an owned transaction', async () => {
    enableQueryCapture()
    await using transaction = await beginTransaction()

    await transaction('/* ownedTransactionCapture */ SELECT $1::integer', [1])

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* ownedTransactionCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
    await transaction.rollback()
  })

  it('captures an owned transaction passed as an explicit query exactly once', async () => {
    enableQueryCapture()
    await using transaction = await beginTransaction()

    await withTransactionOptions({ query: transaction }, query =>
      write('/* explicitQueryCapture */ SELECT $1::integer', [1], { query }),
    )

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* explicitQueryCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
    await transaction.rollback()
  })

  it('captures queries executed through an active borrowed client transaction', async () => {
    enableQueryCapture()
    await using transaction = await beginTransaction()

    await withTransactionOptions({ client: transaction.client }, query =>
      write('/* borrowedClientCapture */ SELECT $1::integer', [1], { query }),
    )

    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({
        text: '/* borrowedClientCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
    await transaction.rollback()
  })

  it('captures queries executed through an internally owned transaction', async () => {
    enableQueryCapture()

    await withTransactionOptions({}, query =>
      write('/* internalTransactionCapture */ SELECT $1::integer', [1], { query }),
    )

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
