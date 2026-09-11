import { config } from '@data-stores/valkey-core/config'
import { retrySaturationError } from 'valkyries'

type RetrySaturationError = <T>(
  operation: () => Promise<T>,
  options: { attempts: number; delayMs: number },
) => Promise<T>

export type RetryCacheSaturationDependencies = {
  config: Pick<typeof config, 'inflight_retry_attempts' | 'inflight_retry_delay_ms'>
  retrySaturationError: RetrySaturationError
}

const defaultDependencies: RetryCacheSaturationDependencies = {
  config,
  retrySaturationError,
}

export function retryCacheSaturation<T>(
  operation: () => Promise<T>,
  dependencies: RetryCacheSaturationDependencies = defaultDependencies,
): Promise<T> {
  return dependencies.retrySaturationError(operation, {
    attempts: dependencies.config.inflight_retry_attempts,
    delayMs: dependencies.config.inflight_retry_delay_ms,
  })
}
