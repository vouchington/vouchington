import SharedDbScopeGuardRunner from './vitest.runner.shared-db-scope-guard.mts'
import createPlatformStatsCache from './vitest.platform-stats-cache-container.mts'

const changedKeys = ['VALKEY_CACHE_URL', 'VALKEY_RATE_LIMITER_URL', 'VALKEY_BLOOM_URL'] as const

/** Own the private cache only in the worker that collects the platform-stats file. */
export default class PlatformStatsCacheRunner extends SharedDbScopeGuardRunner {
  #cache: Awaited<ReturnType<typeof createPlatformStatsCache>> | undefined
  #previous: Map<string, string | undefined> | undefined

  constructor(config: ConstructorParameters<typeof SharedDbScopeGuardRunner>[0]) {
    super(config)
    if (!this.onCleanupWorkerContext) throw new Error('Private platform-stats cache requires forks')
    // Worker cleanup follows file hooks, including cache-client close and owned server drains.
    // Docker keeps its existing external-operation deadline outside the five-second test hooks.
    this.onCleanupWorkerContext(() => this.#closeCache())
  }

  override onAfterRunFiles(files: Parameters<SharedDbScopeGuardRunner['onAfterRunFiles']>[0]) {
    const errors: unknown[] = []
    try {
      super.onAfterRunFiles(files)
    } catch (err) {
      errors.push(err)
    }
    try {
      this.#closeCache()
    } catch (err) {
      // A thrown runner finalizer prevents Vitest from flushing task results. Preserve those
      // original failures beside cleanup errors rather than replacing their diagnostics.
      const tasks: Array<(typeof files)[number] | (typeof files)[number]['tasks'][number]> = [
        ...files,
      ]
      const reportedFailures = new Set<unknown>(errors)
      for (const task of tasks) {
        for (const failure of task.result?.errors ?? []) {
          if (reportedFailures.has(failure)) continue
          reportedFailures.add(failure)
          errors.push(new Error(failure.message, { cause: failure }))
        }
        if ('tasks' in task) tasks.push(...task.tasks)
      }
      errors.push(err)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1)
      throw new AggregateError(errors, 'Platform-stats runner and cache cleanup failed', {
        cause: errors[0],
      })
  }

  #closeCache() {
    const cache = this.#cache
    this.#cache = undefined
    try {
      cache?.close()
    } finally {
      for (const [key, value] of this.#previous ?? []) {
        if (value === undefined) Reflect.deleteProperty(process.env, key)
        else process.env[key] = value
      }
      this.#previous = undefined
    }
  }

  async onBeforeCollect() {
    this.#cache = await createPlatformStatsCache()
    this.#previous = new Map(changedKeys.map(key => [key, process.env[key]]))
    const defaultUrl =
      process.env.VALKEY_URL || `redis://${process.env.DOCKER_HOST_IP || 'localhost'}:6379`
    const previousCacheUrl = process.env.VALKEY_CACHE_URL || defaultUrl
    process.env.VALKEY_RATE_LIMITER_URL ||= previousCacheUrl
    process.env.VALKEY_BLOOM_URL ||= previousCacheUrl
    process.env.VALKEY_CACHE_URL = this.#cache.url
  }
}
