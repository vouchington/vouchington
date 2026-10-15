import type { QueryExecutor } from '@data-stores/psql'
import { createCheckpointProofTrace } from './post-publication-shadow-audit-trace.mts'
import { describe, expect, it } from 'vitest'
import { createTestShadowAuditOwner } from './post-publication-shadow-audit-owner.mts'

describe('shadow audit proof ownership', () => {
  it('preserves a direct undefined callback failure without an owned rejection', async () => {
    const owner = createTestShadowAuditOwner()
    owner.fail(undefined)
    await owner.drain()
    owner.complete()
    let failed = false
    let captured: unknown
    try {
      owner.assertResult()
    } catch (err) {
      failed = true
      captured = err
    }
    expect(captured).toBeUndefined()
    expect(failed).toBe(true)
    await expect(owner.finish()).resolves.toBeUndefined()
  })

  it('aggregates a sole admitted undefined rejection with the raw callback cause', async () => {
    const owner = createTestShadowAuditOwner()
    const rejection = Promise.withResolvers<void>()
    const operation = owner.admit(() => rejection.promise)
    rejection.reject(undefined)
    try {
      await operation
    } catch (err) {
      owner.fail(err)
    }
    await owner.drain()
    owner.complete()
    expect(() => owner.assertResult()).toThrow(
      expect.objectContaining({ errors: [undefined], cause: undefined }),
    )
    await expect(owner.finish()).rejects.toMatchObject({ errors: [undefined], cause: undefined })
  })

  it.each([undefined, new Error('shared operation failure')])(
    'retains distinct detached operations with the same raw reason: %s',
    async reason => {
      const owner = createTestShadowAuditOwner()
      // The owner must observe failures even when the callback never awaits these promises.
      const firstStarted = Promise.withResolvers<void>()
      const secondStarted = Promise.withResolvers<void>()
      void owner.admit(() => {
        firstStarted.resolve()
        const rejection = Promise.withResolvers<void>()
        rejection.reject(reason)
        return rejection.promise
      })
      void owner.admit(() => {
        secondStarted.resolve()
        const rejection = Promise.withResolvers<void>()
        rejection.reject(reason)
        return rejection.promise
      })
      await Promise.all([firstStarted.promise, secondStarted.promise])
      await owner.drain()
      await owner.drain()
      owner.complete()
      let captured: unknown
      try {
        owner.assertResult()
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(AggregateError)
      const aggregate = captured as AggregateError
      expect(aggregate.errors).toHaveLength(2)
      expect(aggregate.errors[0]).toBe(reason)
      expect(aggregate.errors[1]).toBe(reason)
      expect(Object.hasOwn(aggregate, 'cause')).toBe(true)
      expect(aggregate.cause).toBe(reason)
      await expect(owner.finish()).rejects.toMatchObject({ errors: [reason, reason] })
    },
  )

  it('retains admission order despite reverse settlement and keeps primary and cleanup raw', async () => {
    const owner = createTestShadowAuditOwner()
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const primary = new Error('callback')
    const cleanup = new Error('cleanup')
    void owner.admit(() => first.promise)
    void owner.admit(() => {
      started.resolve()
      return second.promise
    })
    await started.promise
    second.reject('second')
    first.reject('first')
    owner.fail(primary)
    await owner.drain()
    owner.cleanupFailure(cleanup)
    await owner.drain()
    owner.complete()
    let captured: unknown
    try {
      owner.assertResult()
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(AggregateError)
    const aggregate = captured as AggregateError
    expect(aggregate.errors).toEqual(['first', 'second', cleanup])
    expect(aggregate.errors[2]).toBe(cleanup)
    expect(aggregate.cause).toBe(primary)
    await expect(owner.finish()).rejects.toMatchObject({ cause: primary })
  })

  it('fences admission while a late acquisition and resource disposal still drain', async () => {
    const owner = createTestShadowAuditOwner()
    const acquisition = Promise.withResolvers<{ dispose: () => void }>()
    const started = Promise.withResolvers<void>()
    let disposed = false
    const pending = owner.admit(() => {
      started.resolve()
      return acquisition.promise
    })
    await started.promise
    let finished = false
    const finish = owner.finish().then(() => {
      return (finished = true)
    })
    expect(() => owner.admit(async () => undefined)).toThrow(/closing/)
    expect(() => owner.assertOpen()).toThrow(/closing/)
    acquisition.resolve({
      dispose: () => {
        disposed = true
      },
    })
    const resource = await pending
    await owner.drain()
    expect(finished).toBe(false)
    resource.dispose()
    expect(disposed).toBe(true)
    owner.complete()
    await finish
    expect(finished).toBe(true)
  })

  it('waits for an admitted root actor before completion and rejects its later admissions', async () => {
    const owner = createTestShadowAuditOwner()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    let actorSettled = false
    const actor = owner.admit(async () => {
      entered.resolve()
      await resume.promise
      expect(() => owner.admit(async () => undefined)).toThrow(/closing/)
      expect(() => owner.assertOpen()).toThrow(/closing/)
      actorSettled = true
    })
    await entered.promise
    const draining = owner.drain()
    let finished = false
    const finish = owner.finish().then(() => {
      return (finished = true)
    })
    expect(actorSettled).toBe(false)
    expect(finished).toBe(false)
    resume.resolve()
    await actor
    await draining
    expect(actorSettled).toBe(true)
    expect(finished).toBe(false)
    owner.complete()
    await finish
    owner.assertResult()
  })
})

describe('checkpoint proof diagnostic error fidelity', () => {
  it('does not turn an undefined query rejection into success', async () => {
    const calls: Parameters<QueryExecutor>[] = []
    const query: QueryExecutor = async (...args) => {
      calls.push(args)
      const rejection = Promise.withResolvers<never>()
      rejection.reject(undefined)
      return rejection.promise
    }
    const traced = createCheckpointProofTrace('synthetic-checkpoint-trace').guard(query)
    let failed = false
    let captured: unknown
    try {
      await traced('/* traceUndefined */ SELECT $1', ['not-recorded'])
    } catch (err) {
      failed = true
      captured = err
    }
    expect(failed).toBe(true)
    expect(captured).toBeUndefined()
    expect(calls).toEqual([['/* traceUndefined */ SELECT $1', ['not-recorded']]])
  })

  it('preserves the same raw failure on two separate query operations', async () => {
    const failure = Object.assign(new Error('owned serialization failure'), { code: '40001' })
    let calls = 0
    const query: QueryExecutor = async () => {
      calls += 1
      throw failure
    }
    const traced = createCheckpointProofTrace('synthetic-checkpoint-trace').guard(query)
    await expect(traced('/* traceFirst */ SELECT 1')).rejects.toBe(failure)
    await expect(traced('/* traceSecond */ SELECT 2')).rejects.toBe(failure)
    expect(calls).toBe(2)
  })

  it('fails closed when the executor does not report its production fence', async () => {
    let calls = 0
    const query: QueryExecutor = async () => {
      calls += 1
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }
    }
    await expect(
      createCheckpointProofTrace('synthetic-checkpoint-trace').snapshot('before-cursor', query),
    ).rejects.toThrow('Checkpoint proof snapshot requires its production session fence')
    expect(calls).toBe(1)
  })
})

describe('checkpoint diagnostic metadata access failures', () => {
  it('preserves the raw query rejection when a code accessor or Proxy trap throws', async () => {
    const metadataFailure = new Error('Diagnostic metadata is unreadable')
    const getterFailure = Object.defineProperty(new Error('Original query failure'), 'code', {
      get() {
        throw metadataFailure
      },
    })
    const proxyFailure = new Proxy(new Error('Original proxied query failure'), {
      has() {
        throw metadataFailure
      },
    })
    for (const failure of [getterFailure, proxyFailure]) {
      const query: QueryExecutor = async () => {
        throw failure
      }
      const traced = createCheckpointProofTrace('synthetic-checkpoint-trace').guard(query)
      await expect(traced('/* traceUnreadableCode */ SELECT 1')).rejects.toBe(failure)
    }
  })
})
