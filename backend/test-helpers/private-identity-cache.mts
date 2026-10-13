import { cacheValkeyClient, valkeyEvents } from 'valkyries'
import { onTestFinished, vi } from 'vitest'
import { caches } from '../services/entity-cache/caches.mts'
let active = false

/** Join the public producer's owned cache terminal, then assert the actual stored value. */
export async function withPrivateIdentityCacheFill<T>(
  userId: string,
  action: () => PromiseLike<T>,
  admission?: { beforeWrite: () => Promise<void>; release: () => void },
) {
  if (active) throw new Error('Overlapping private identity cache observation')
  const cache = caches.users_private
  const { physicalKeys, serializedKeys } = cache.getPhysicalCacheKeys([userId])
  const physicalKey = physicalKeys[0]
  const serializedKey = serializedKeys[0]
  if (!physicalKey || !serializedKey) throw new Error('Expected concrete owned cache keys')
  const terminal = Promise.withResolvers<void>()
  void terminal.promise.catch(() => {})
  const started: Promise<unknown>[] = []
  let operation: Promise<T> | undefined
  let closing: Promise<void> | undefined
  let restore: (() => void) | undefined
  let cursor = 0
  let fillPending = false
  const matches = (event: { cacheName: string; keys: string[] }) =>
    event.cacheName === cache.prefix && event.keys.includes(serializedKey)
  const completed = (event: { cacheName: string; keys: string[] }) => {
    if (matches(event)) terminal.resolve()
  }
  const skipped = (event: { cacheName: string; keys: string[] }) => {
    if (matches(event)) terminal.reject(new Error('Owned identity cache fill was invalidated'))
  }
  const missed = (event: { cacheName: string; keys: string[] }) => {
    if (matches(event)) fillPending = true
  }
  const close = () => (closing ??= dispose())
  onTestFinished(close)
  active = true
  let result: PromiseSettledResult<T> | undefined
  let setupFailed = false
  let setupError: unknown
  try {
    valkeyEvents.on('cache:set', completed)
    valkeyEvents.on('cache:hit', completed)
    valkeyEvents.on('cache:set-skipped', skipped)
    valkeyEvents.on('cache:miss', missed)
    const invoke = cacheValkeyClient.invokeScript
    const spy = vi
      .spyOn(cacheValkeyClient, 'invokeScript')
      .mockImplementation((script, options) => {
        if (!options?.keys?.some(key => String(key) === physicalKey))
          return invoke.call(cacheValkeyClient, script, options)
        const isFill = fillPending
        fillPending = false
        const command = Promise.resolve().then(() => {
          if (closing) throw new Error('Owned identity cache scope is closing')
          return Promise.resolve(isFill ? admission?.beforeWrite() : undefined).then(() => {
            if (closing) throw new Error('Owned identity cache scope is closing')
            return invoke.call(cacheValkeyClient, script, options)
          })
        })
        started.push(command)
        void command.catch(err => terminal.reject(err))
        return command
      })
    restore = () => spy.mockRestore()
    operation = Promise.resolve().then(async () => {
      const result = await action()
      await terminal.promise
      const errors = await drain()
      if (errors.length)
        throw new AggregateError(errors, 'Owned cache commands failed', { cause: errors[0] })
      const cached = await cache.get(userId)
      if (
        cached === null ||
        typeof cached !== 'object' ||
        !('bluesky_account' in cached) ||
        cached.bluesky_account !== null
      )
        throw new Error('Owned private identity cache was not filled with an unlinked account')
      return result
    })
    void operation.catch(() => {})
    ;[result] = await Promise.allSettled([operation])
  } catch (err) {
    setupFailed = true
    setupError = err
  }
  const [cleanup] = await Promise.allSettled([close()])
  const errors = setupFailed ? [setupError] : result?.status === 'rejected' ? [result.reason] : []
  if (cleanup?.status === 'rejected') errors.push(cleanup.reason)
  if (errors.length === 1) throw errors[0]
  if (errors.length)
    throw new AggregateError(errors, 'Identity cache operation and cleanup failed', {
      cause: errors[0],
    })
  if (result?.status !== 'fulfilled') throw new Error('Missing identity cache result')
  return result.value

  async function drain() {
    const errors: unknown[] = []
    for (; cursor < started.length; cursor++) {
      const [result] = await Promise.allSettled([started[cursor]!])
      if (result?.status === 'rejected') errors.push(result.reason)
    }
    return errors
  }
  async function dispose() {
    terminal.reject(new Error('Owned identity cache scope is closed'))
    const errors: unknown[] = []
    try {
      admission?.release()
    } catch (err) {
      errors.push(err)
    }
    await Promise.allSettled([operation])
    errors.push(...(await drain()))
    try {
      restore?.()
    } catch (err) {
      errors.push(err)
    }
    valkeyEvents.off('cache:set', completed)
    valkeyEvents.off('cache:hit', completed)
    valkeyEvents.off('cache:set-skipped', skipped)
    valkeyEvents.off('cache:miss', missed)
    active = false
    if (errors.length)
      throw new AggregateError(errors, 'Identity cache cleanup failed', { cause: errors[0] })
  }
}
