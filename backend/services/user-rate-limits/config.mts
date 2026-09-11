import { DynamicConfig } from '@data-stores/valkey'
import type { RateLimitCategory } from './types.mts'

export const RATE_LIMIT_CONFIG_KEY = 'rate-limit-thresholds'

export const rateLimitConfig = new DynamicConfig({
  key: RATE_LIMIT_CONFIG_KEY,
  fieldTypes: {
    // Read operations (per window)
    read_tier0: 'number',
    read_tier1: 'number',
    read_tier2: 'number',
    read_tier3: 'number',
    read_tier4: 'number',
    read_tier5: 'number',
    // Write operations (per window)
    write_tier0: 'number',
    write_tier1: 'number',
    write_tier2: 'number',
    write_tier3: 'number',
    write_tier4: 'number',
    write_tier5: 'number',
    // Sensitive operations (per window)
    sensitive_tier0: 'number',
    sensitive_tier1: 'number',
    sensitive_tier2: 'number',
    sensitive_tier3: 'number',
    sensitive_tier4: 'number',
    sensitive_tier5: 'number',
    // TTL seconds per category
    read_ttl: 'number',
    write_ttl: 'number',
    sensitive_ttl: 'number',
  },
  defaultFields: {
    read_tier0: 180,
    read_tier1: 180,
    read_tier2: 300,
    read_tier3: 600,
    read_tier4: 1000,
    read_tier5: 1500,
    write_tier0: 15,
    write_tier1: 15,
    write_tier2: 30,
    write_tier3: 60,
    write_tier4: 100,
    write_tier5: 150,
    sensitive_tier0: 5,
    sensitive_tier1: 5,
    sensitive_tier2: 5,
    sensitive_tier3: 10,
    sensitive_tier4: 15,
    sensitive_tier5: 20,
    read_ttl: 60,
    write_ttl: 60,
    sensitive_ttl: 60,
  },
})

export function getRateLimitThreshold(category: RateLimitCategory, tier: number): number {
  const key = `${category}_tier${tier}`
  const value = rateLimitConfig.getFields()[key]
  return typeof value === 'number' ? value : 10
}

export function getRateLimitTtl(category: RateLimitCategory): number {
  const key = `${category}_ttl`
  const value = rateLimitConfig.getFields()[key]
  return typeof value === 'number' ? value : 60
}
