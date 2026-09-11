import { writeSync } from 'node:fs'
import Sentry from './sentry.mts'

const sentryThrottleMs = 10_000
const lastSentryReportByClientCommand = new Map<string, number>()

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts — kept local to avoid changing the
// export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

export type ValkeySaturationContext = {
  client: string
  command: string
  attempt: number
}

// #8940: a saturation storm is the strongest surviving correlate of the backend-unit
// worker-exit flake, but the existing console.warn/breadcrumb are per-process-invisible —
// nothing ties a burst of these back to the fork (pid) that produced it. Under test, mirror
// a bounded sample to fd 2 via a synchronous write (same rationale as the fork-exit sentinel:
// async stderr is the channel already losing data under an abrupt fork death). This does not
// import test-helpers/vitest-fork-exit-sentinel.mts — that module lives outside every workspace
// package boundary this file's package.json declares, and reaching across it from a production
// module would invert the dependency direction (production depending on test-only infra) that
// the rest of this codebase does not do. The pid alone is enough: readers correlate a
// [valkey-saturation] pid against the same pid's own [vitest-fork-exit] line to recover which
// test module was running when the storm happened, without this module needing to track it.
const saturationSentinelSampleSize = 5
const saturationSentinelSamplePeriod = 50
let saturationEventCount = 0

function emitSaturationSentinel(context: ValkeySaturationContext): void {
  if (process.env.NODE_ENV !== 'test') return
  saturationEventCount++
  const isSampled =
    saturationEventCount <= saturationSentinelSampleSize ||
    saturationEventCount % saturationSentinelSamplePeriod === 0
  if (!isSampled) return
  writeSync(
    2,
    `[valkey-saturation] pid=${process.pid} client=${context.client} command=${context.command} attempt=${context.attempt} count=${saturationEventCount}\n`,
  )
}

/**
 * Record a single Valkey inflight-saturation retry attempt.
 * Emits a console warning in development/CI, adds a Sentry breadcrumb so the
 * retry trail is visible when a subsequent onError() call fires, and captures
 * an alertable warning event for saturation monitoring.
 */
export function recordValkeySaturation(context: ValkeySaturationContext): void {
  emitSaturationSentinel(context)
  if (shouldLogToConsole()) {
    console.warn('[valkey] inflight saturation retry', context)
  }
  Sentry.addBreadcrumb({
    category: 'valkey',
    message: 'inflight saturation retry',
    level: 'warning',
    data: context,
  })
  if (shouldCaptureSentryMessage(context)) {
    Sentry.captureMessage('valkey_inflight_saturation', {
      level: 'warning',
      tags: {
        reason: 'valkey_inflight_saturation',
        client: context.client,
        command: context.command,
      },
      extra: { attempt: context.attempt },
    })
  }
}

function shouldCaptureSentryMessage(context: ValkeySaturationContext): boolean {
  if (process.env.NODE_ENV === 'test') return true

  const throttleKey = `${context.client}:${context.command}`
  const now = Date.now()
  const lastReportedAt = lastSentryReportByClientCommand.get(throttleKey)

  if (lastReportedAt !== undefined && now - lastReportedAt < sentryThrottleMs) return false

  lastSentryReportByClientCommand.set(throttleKey, now)
  return true
}
