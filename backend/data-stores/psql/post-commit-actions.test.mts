import { describe, expect, it, vi } from 'vitest'
import sql from 'sql-template-strings'
import {
  beginBoundedTransaction,
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
  writePool,
} from './setup.mts'

describe('transaction post-commit actions', () => {
  it('runs actions only after an explicit commit', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    registerPostCommitAction(transaction, action)
    await transaction(sql`/* post-commit actions explicit commit */ SELECT 1`)
    expect(action).not.toHaveBeenCalled()
    await transaction.commit()
    expect(action).toHaveBeenCalledOnce()
  })

  it('drops actions when a resource disposes without commit', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    {
      await using transaction = await beginTransaction()
      registerPostCommitAction(transaction, action)
    }
    expect(action).not.toHaveBeenCalled()
  })

  it('drops actions after rollback', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    registerPostCommitAction(transaction, action)
    await transaction.rollback()
    expect(action).not.toHaveBeenCalled()
    expect(() => registerPostCommitAction(transaction, action)).toThrow(
      'Post-commit actions require a transaction query owned by @data-stores/psql wrappers',
    )
  })

  it('defers nested borrowed-client actions to the resource owner', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    await withTransactionOptions({ client: transaction.client }, async nestedQuery => {
      registerPostCommitAction(nestedQuery, action)
    })
    expect(action).not.toHaveBeenCalled()
    await transaction.commit()
    expect(action).toHaveBeenCalledOnce()
  })

  it('discards a rejected nested scope action while retaining sibling work', async () => {
    const rejected = vi.fn<() => Promise<void>>(async () => undefined)
    const retained = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    await expect(
      withTransactionOptions({ client: transaction.client }, async query => {
        registerPostCommitAction(query, rejected)
        throw new Error('nested rollback')
      }),
    ).rejects.toThrow('nested rollback')
    await withTransactionOptions({ client: transaction.client }, async query => {
      registerPostCommitAction(query, retained)
    })
    await transaction.commit()
    expect(rejected).not.toHaveBeenCalled()
    expect(retained).toHaveBeenCalledOnce()
  })

  it('drops nested client actions when an outer resource disposes without commit', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    {
      await using transaction = await beginTransaction()
      await withTransactionOptions({ client: transaction.client }, async query => {
        registerPostCommitAction(query, action)
      })
    }
    expect(action).not.toHaveBeenCalled()
  })

  it('retains outer actions around a rejected nested client scope', async () => {
    const beforeNested = vi.fn<() => Promise<void>>(async () => undefined)
    const rejectedNested = vi.fn<() => Promise<void>>(async () => undefined)
    const afterNested = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    registerPostCommitAction(transaction, beforeNested)
    await expect(
      withTransactionOptions({ client: transaction.client }, async query => {
        registerPostCommitAction(query, rejectedNested)
        throw new Error('rollback nested post-commit action while outer commits')
      }),
    ).rejects.toThrow('rollback nested post-commit action while outer commits')
    registerPostCommitAction(transaction, afterNested)
    await transaction.commit()
    expect(beforeNested).toHaveBeenCalledOnce()
    expect(rejectedNested).not.toHaveBeenCalled()
    expect(afterNested).toHaveBeenCalledOnce()
  })

  it('drops committed inner actions when their enclosing nested scope rejects', async () => {
    const innerAction = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginTransaction()
    await expect(
      withTransactionOptions({ client: transaction.client }, async nestedQuery => {
        await withTransactionOptions({ client: nestedQuery.client }, async innerQuery => {
          registerPostCommitAction(innerQuery, innerAction)
        })
        throw new Error('rollback enclosing nested post-commit action')
      }),
    ).rejects.toThrow('rollback enclosing nested post-commit action')
    await transaction.commit()
    expect(innerAction).not.toHaveBeenCalled()
  })

  it('retains a concurrent nested action when another nested scope rejects', async () => {
    const rejectedAction = vi.fn<() => Promise<void>>(async () => undefined)
    const retainedAction = vi.fn<() => Promise<void>>(async () => undefined)
    const firstStarted = Promise.withResolvers<void>()
    const secondStarted = Promise.withResolvers<void>()
    const allowFirstRegistration = Promise.withResolvers<void>()
    const firstRegistered = Promise.withResolvers<void>()
    const rejectFirst = Promise.withResolvers<void>()
    await using transaction = await beginTransaction()
    const rejectedScope = withTransactionOptions({ client: transaction.client }, async query => {
      firstStarted.resolve()
      await allowFirstRegistration.promise
      registerPostCommitAction(query, rejectedAction)
      firstRegistered.resolve()
      await rejectFirst.promise
      throw new Error('reject first concurrent nested post-commit action')
    })
    const rejectedScopeRejection = rejectedScope.catch((error: unknown) => error)
    await firstStarted.promise
    const retainedScope = withTransactionOptions({ client: transaction.client }, async query => {
      secondStarted.resolve()
      await firstRegistered.promise
      registerPostCommitAction(query, retainedAction)
    })
    await secondStarted.promise
    allowFirstRegistration.resolve()
    await retainedScope
    rejectFirst.resolve()
    await expect(rejectedScopeRejection).resolves.toMatchObject({
      message: 'reject first concurrent nested post-commit action',
    })
    await transaction.commit()
    expect(rejectedAction).not.toHaveBeenCalled()
    expect(retainedAction).toHaveBeenCalledOnce()
  })

  it('rejects actions on an externally active, unowned client transaction', async () => {
    const action = vi.fn<() => Promise<void>>(async () => undefined)
    const client = await writePool.connect()
    let transactionOpen = false
    try {
      // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- verifies an externally owned transaction cannot claim post-commit actions
      await client.query('/* post-commit actions external begin */ BEGIN')
      transactionOpen = true
      await expect(
        withTransactionOptions({ client }, async query => {
          registerPostCommitAction(query, action)
        }),
      ).rejects.toThrow('Post-commit actions require a transaction query owned')
    } finally {
      if (transactionOpen) {
        // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- restore the externally owned transaction after the ownership regression
        await client.query('/* post-commit actions external rollback */ ROLLBACK')
      }
      client.release()
    }
  })

  it('runs bounded-resource actions after commit and drops them on failure', async () => {
    const committed = vi.fn<() => Promise<void>>(async () => undefined)
    await using transaction = await beginBoundedTransaction({
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 5_000,
    })
    registerPostCommitAction(transaction, committed)
    await transaction.commit()
    expect(committed).toHaveBeenCalledOnce()

    const rolledBack = vi.fn<() => Promise<void>>(async () => undefined)
    await using failed = await beginBoundedTransaction({
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 5_000,
    })
    registerPostCommitAction(failed, rolledBack)
    await expect(
      failed(sql`/* post-commit actions failed bounded commit */ SELECT 1 / 0`),
    ).rejects.toThrow('division by zero')
    await expect(failed.commit()).rejects.toThrow('division by zero')
    expect(rolledBack).not.toHaveBeenCalled()
    expect(() => registerPostCommitAction(failed, rolledBack)).toThrow(
      'Post-commit actions require a transaction query owned by @data-stores/psql wrappers',
    )
  })
})
