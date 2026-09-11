import { retrySaturationError as retryPublicRateLimiterSaturation } from 'valkyries'
import { config } from '@data-stores/valkey-core/config'

export type RetryRateLimiterSaturationDependencies = {
  config: Pick<typeof config, 'inflight_retry_attempts' | 'inflight_retry_delay_ms'>
  retryRateLimiterSaturation: typeof retryPublicRateLimiterSaturation
}

const defaultDependencies: RetryRateLimiterSaturationDependencies = {
  config,
  retryRateLimiterSaturation: retryPublicRateLimiterSaturation,
}

export function retryRateLimiterSaturation<T>(
  operation: () => Promise<T>,
  dependencies: RetryRateLimiterSaturationDependencies = defaultDependencies,
): Promise<T> {
  return dependencies.retryRateLimiterSaturation(operation, {
    attempts: dependencies.config.inflight_retry_attempts,
    delayMs: dependencies.config.inflight_retry_delay_ms,
  })
}
