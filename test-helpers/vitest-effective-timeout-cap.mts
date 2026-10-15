import type { Plugin } from 'vitest/config'

// Validate selected projects after framework normalization, before global setup imports.
export function effectiveTimeoutCap(): Plugin {
  return {
    name: 'voucha-effective-test-timeout-cap',
    configureVitest({ project }) {
      for (const field of ['testTimeout', 'hookTimeout'] as const) {
        const value = project.config[field]
        if (!Number.isFinite(value) || value <= 0 || value > 30_000) {
          throw new RangeError(
            `Project ${project.config.name}: effective ${field} must be finite, positive, and at most 30000ms; received ${value}`,
          )
        }
      }
    },
  }
}
