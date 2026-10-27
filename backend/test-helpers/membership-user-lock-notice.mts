import { AsyncLocalStorage } from 'node:async_hooks'
import { onTestFinished } from 'vitest'
import { writePool, type PoolClient } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { observeTestTransactionLockNotice } from './postgres-advisory-lock-notice.mts'
import { observeTestPostgresLockQuery } from './postgres-lock-query-observation.mts'

const leaseScope = new AsyncLocalStorage<object>()
const marker = '/* expireElapsedMemberships: lock user */'

type MembershipActionOptions<Result> = {
  transactionId: string
  userId: string
  startAction: () => Promise<Result>
  releaseHolder: () => Promise<void>
}
type Admission = { closed: boolean; cleanup?: () => Promise<void> }

export async function runTestMembershipActionWithLockNotice<Result>(
  options: MembershipActionOptions<Result>,
): Promise<Result> {
  const admission: Admission = { closed: false }
  let reservation: Promise<PoolClient> | undefined
  let cleanupPromise: Promise<void> | undefined
  let primaryFailure: { reason: unknown } | undefined
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      admission.closed = true
      const failures: unknown[] = []
      try {
        await options.releaseHolder()
      } catch (err) {
        failures.push(err)
      }
      const client = await reservation?.catch(() => undefined)
      try {
        if (admission.cleanup) await admission.cleanup()
        else client?.release()
      } catch (err) {
        failures.push(err)
      }
      if (failures.length) {
        if (primaryFailure) failures.unshift(primaryFailure.reason)
        throw new AggregateError(failures, 'Membership fixture cleanup failed')
      }
    })())
  onTestFinished(cleanup)
  try {
    return await runPoolObservationExclusively(async () => {
      try {
        if (admission.closed) throw new Error('Membership lock notice fixture is already closed')
        reservation = writePool.connect()
        return await runWithReservedMembershipClient(await reservation, options, admission)
      } catch (err) {
        primaryFailure = { reason: err }
        throw err
      } finally {
        await cleanup()
      }
    })
  } finally {
    await cleanup()
  }
}

async function runWithReservedMembershipClient<Result>(
  client: PoolClient,
  options: MembershipActionOptions<Result>,
  admission: Admission,
): Promise<Result> {
  if (admission.closed) throw new Error('Membership lock notice fixture is already closed')
  const token = {}
  const connect = writePool.connect
  const release = client.release
  const ended = Promise.withResolvers<void>()
  const onEnd = () => ended.resolve()
  client.once('end', onEnd)
  const connectDescriptor = Object.getOwnPropertyDescriptor(writePool, 'connect')
  const releaseDescriptor = Object.getOwnPropertyDescriptor(client, 'release')
  let observation: ReturnType<typeof observeTestPostgresLockQuery> | undefined
  let handedOff = false
  let requestedRelease: { reason?: Error | boolean } | undefined
  let actionOutcome: Promise<[PromiseSettledResult<Result>]> | undefined
  let cleanupPromise: Promise<void> | undefined
  let primaryFailure: { reason: unknown } | undefined
  const observer = observeTestTransactionLockNotice(
    client,
    options.transactionId,
    () => observation?.selectedPending === true,
  )
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      admission.closed = true
      const failures: unknown[] = []
      const settled = await actionOutcome
      observation?.restore()
      try {
        await observer.close()
      } catch (err) {
        failures.push(err)
      }
      restore(client, 'release', releaseDescriptor)
      restore(writePool, 'connect', connectDescriptor)
      if ((observation?.pendingQueries ?? 0) !== 0)
        failures.push(new Error('Membership SQL did not finish draining'))
      if (handedOff && !requestedRelease)
        failures.push(new Error('Membership action did not release its owned transaction'))
      if (failures.length && primaryFailure) failures.unshift(primaryFailure.reason)
      else if (failures.length && settled?.[0].status === 'rejected')
        failures.unshift(settled[0].reason)
      const failure = failures.length
        ? new AggregateError(failures, 'Membership lock notice cleanup failed')
        : undefined
      const releaseReason = failure ?? requestedRelease?.reason
      Reflect.apply(release, client, [releaseReason])
      if (releaseReason) await ended.promise
      client.off('end', onEnd)
      if (failure) throw failure
    })())
  admission.cleanup = cleanup
  try {
    await observer.ready
    if (admission.closed) throw new Error('Membership lock notice fixture is already closed')
    observation = observeTestPostgresLockQuery(client, {
      marker,
      binding: { index: 0, value: options.userId },
    })
    client.release = reason => {
      if (requestedRelease) throw new Error('Release called on membership client more than once')
      requestedRelease = { reason }
    }
    Object.defineProperty(writePool, 'connect', {
      configurable: true,
      writable: true,
      value: ((...args: unknown[]) => {
        if (leaseScope.getStore() !== token || admission.closed || handedOff)
          return Reflect.apply(connect, writePool, args)
        if (args.length !== 0)
          throw new Error('Membership lifecycle must start with a Promise transaction checkout')
        handedOff = true
        return Promise.resolve(client)
      }) as typeof writePool.connect,
    })
    actionOutcome = Promise.allSettled([
      leaseScope.run(token, () => Promise.resolve().then(options.startAction)),
    ] as const)
    let waitFailed = false
    try {
      await observer.wait(actionOutcome)
    } catch {
      waitFailed = true
    }
    await options.releaseHolder()
    const [outcome] = await actionOutcome
    if (outcome.status === 'rejected') throw outcome.reason
    if (waitFailed)
      throw new Error('Membership action completed before waiting for the recipient lock')
    return outcome.value
  } catch (err) {
    primaryFailure = { reason: err }
    throw err
  }
}

function restore(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}
